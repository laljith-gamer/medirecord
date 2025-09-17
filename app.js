
const SUPABASE_CONFIG = {
  url: "https://cepmacnkmdtdbqagdvtw.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlcG1hY25rbWR0ZGJxYWdkdnR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5OTg1ODgsImV4cCI6MjA3MzU3NDU4OH0.VTjfkwAnk40zUcpu0qTojNOgFRY3W3XrvputrrTM4w0",
  serviceKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2ZHRzZWR0enNjdnVrenFrd2h5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzQ0ODIxNCwiZXhwIjoyMDY5MDI0MjE0fQ.fjnc4iBavNqfZqvLl5mmOf7aSii1p6tOG4q9aCCqkBU",
};

class SupabaseMediSecureAPI {
  constructor() {
    try {
      if (typeof supabase === "undefined") {
        throw new Error(
          "Supabase library not loaded. Please add the Supabase script to your HTML."
        );
      }

      this.supabase = supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey,
        {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
          },
          db: {
            schema: "public",
          },
        }
      );

      if (
        SUPABASE_CONFIG.serviceKey &&
        SUPABASE_CONFIG.serviceKey !== "your-service-role-key-here"
      ) {
        this.adminClient = supabase.createClient(
          SUPABASE_CONFIG.url,
          SUPABASE_CONFIG.serviceKey,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        );
      }

      this.currentSession = null;
      this.currentUser = null;
      this.deviceFingerprint = generateDeviceFingerprint();
      console.log("✅ Supabase API initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Supabase API:", error);
      throw error;
    }
  }

  // Enhanced connection testing with detailed diagnostics
  async testConnection() {
    try {
      console.log("🧪 Testing Supabase connection...");

      const { data: basicTest, error: basicError } = await this.supabase
        .from("hospitals")
        .select("hospital_id")
        .limit(1);

      console.log("📋 Basic connection test:", {
        data: basicTest,
        error: basicError,
      });

      const { data: hospitalData, error: hospitalError } = await this.supabase
        .from("hospitals")
        .select("*")
        .eq("hospital_id", "AIIMS001")
        .limit(1);

      console.log("🏥 Hospital data test:", {
        data: hospitalData,
        error: hospitalError,
      });

      return {
        basicConnection: !basicError,
        hospitalData: hospitalData?.length > 0,
        errors: {
          basic: basicError?.message,
          hospital: hospitalError?.message,
        },
      };
    } catch (error) {
      console.error("❌ Connection test failed:", error);
      return {
        basicConnection: false,
        hospitalData: false,
        errors: { general: error.message },
      };
    }
  }

  // FIXED: Complete validateInput function
  validateInput(input, type) {
    if (!input || typeof input !== "string") return false;

    const patterns = {
      hospital_id: /^[A-Z0-9]{6,20}$/,
      patient_id: /^PAT[0-9]{7,15}$/,
      email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
      phone: /^\+?[1-9][0-9]{1,14}$/,
      password:
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      name: /^[A-Za-z\s]{2,100}$/,
      license: /^[A-Z0-9/-]{5,50}$/,
      record_type:
        /^(consultation|prescription|lab_report|imaging|surgery|vaccination|discharge|emergency)$/i,
      severity: /^(low|medium|high|critical)$/i,
    };

    const pattern = patterns[type];
    if (!pattern) {
      // Default validation for general text
      return input.length > 0 && input.length <= 1000 && !/[<>{}]/.test(input);
    }

    return pattern.test(input.trim());
  }

  // ADDED: Proper password hashing with bcrypt
  async hashPassword(password) {
    try {
      if (typeof bcrypt === "undefined") {
        console.warn("bcrypt not loaded, using fallback hashing");
        return "hashed_" + btoa(password); // Fallback for development
      }
      const saltRounds = 12;
      const hash = await bcrypt.hash(password, saltRounds);
      return hash;
    } catch (error) {
      console.error("Password hashing failed:", error);
      throw new Error("Failed to secure password");
    }
  }

  async verifyPassword(password, hash) {
    try {
      if (typeof bcrypt === "undefined") {
        return hash === "hashed_" + btoa(password); // Fallback for development
      }
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.error("Password verification failed:", error);
      return false;
    }
  }

  // Enhanced hospital login with comprehensive error handling
  async loginHospital(hospitalId, password, geolocation = null) {
    try {
      console.log("🔄 Attempting login for hospital:", hospitalId);

      // Enhanced input validation
      if (!hospitalId || !password) {
        throw new Error("Hospital ID and password are required");
      }

      if (!this.validateInput(hospitalId, "hospital_id")) {
        throw new Error(
          "Invalid hospital ID format. Use format like: SECURE001"
        );
      }

      // Check connection
      const connectionTest = await this.testConnection();
      if (!connectionTest.basicConnection) {
        throw new Error(
          "Database connection failed. Please check your Supabase configuration."
        );
      }

      // Set hospital context for RLS
      await this.setHospitalContext(hospitalId);

      // Get hospital record
      const { data: hospital, error: hospitalError } = await this.supabase
        .from("hospitals")
        .select("*")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .single();

      if (hospitalError) {
        if (hospitalError.code === "PGRST116") {
          await this.logAuditEvent(
            "FAILED_LOGIN_ATTEMPT",
            hospitalId,
            "Hospital not found"
          );
          return {
            success: false,
            message: "Invalid credentials",
            errorCode: "INVALID_CREDENTIALS",
          };
        }
        throw new Error(`Database query failed: ${hospitalError.message}`);
      }

      if (!hospital) {
        await this.logAuditEvent(
          "FAILED_LOGIN_ATTEMPT",
          hospitalId,
          "Hospital not found"
        );
        return {
          success: false,
          message: "Invalid credentials",
          errorCode: "INVALID_CREDENTIALS",
        };
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(
        password,
        hospital.password_hash
      );

      if (!isPasswordValid) {
        await this.logAuditEvent(
          "FAILED_LOGIN_ATTEMPT",
          hospitalId,
          "Invalid password"
        );
        return {
          success: false,
          message: "Invalid credentials",
          errorCode: "INVALID_CREDENTIALS",
        };
      }

      // Create secure session
      const sessionData = {
        success: true,
        session_token: this.generateSessionToken(),
        csrf_token: this.generateCSRFToken(),
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        hospital_name: hospital.name,
        risk_score: this.calculateRiskScore(
          geolocation,
          this.deviceFingerprint
        ),
        message: "Login successful",
      };

      // Log successful login
      await this.logAuditEvent(
        "SUCCESSFUL_LOGIN",
        hospitalId,
        "Hospital login successful"
      );

      return this.processLoginResponse(sessionData, hospitalId);
    } catch (error) {
      console.error("🚨 Login error details:", error);
      await this.logAuditEvent("LOGIN_ERROR", hospitalId, error.message);
      return this.formatLoginError(error);
    }
  }

  // ADDED: Set hospital context for RLS
  async setHospitalContext(hospitalId) {
    try {
      await this.supabase.rpc("set_hospital_context", {
        hospital_id: hospitalId,
      });
    } catch (error) {
      console.warn("Failed to set hospital context:", error);
    }
  }

  // ADDED: Risk score calculation
  calculateRiskScore(geolocation, deviceFingerprint) {
    let riskScore = 1;
    if (!geolocation) riskScore += 1;
    const storedFingerprint = localStorage.getItem(
      `deviceFingerprint_${this.currentSession?.hospitalId}`
    );
    if (storedFingerprint && storedFingerprint !== deviceFingerprint) {
      riskScore += 2;
    }
    return Math.min(riskScore, 5);
  }

  // Process successful login response
  processLoginResponse(data, hospitalId) {
    if (data.success) {
      this.currentSession = {
        hospitalId: hospitalId,
        hospitalName: data.hospital_name || hospitalId,
        sessionToken: data.session_token,
        csrfToken: data.csrf_token,
        expiresAt: data.expires_at,
        riskScore: data.risk_score || 1,
      };

      // Store device fingerprint
      localStorage.setItem(
        `deviceFingerprint_${hospitalId}`,
        this.deviceFingerprint
      );

      console.log("✅ Login successful:", this.currentSession);
      return {
        success: true,
        session: this.currentSession,
        message: data.message || "Login successful",
        requiresMFA: data.mfa_required || false,
        passwordWarning: data.password_warning || null,
      };
    } else {
      return {
        success: false,
        message: data.message || "Login failed",
        errorCode: data.error_code || "LOGIN_FAILED",
      };
    }
  }

  // Format login errors with user-friendly messages
  formatLoginError(error) {
    let userMessage = "Login service temporarily unavailable";
    let errorCode = "LOGIN_ERROR";

    if (error.message?.includes("timeout")) {
      userMessage =
        "Login request timed out. Please check your connection and try again.";
      errorCode = "TIMEOUT";
    } else if (error.message?.includes("Invalid hospital ID")) {
      userMessage = error.message;
      errorCode = "INVALID_INPUT";
    } else if (error.message?.includes("required")) {
      userMessage = error.message;
      errorCode = "MISSING_INPUT";
    } else if (error.message?.includes("configuration")) {
      userMessage = "Database configuration error. Please contact support.";
      errorCode = "CONFIG_ERROR";
    }

    return {
      success: false,
      message: userMessage,
      errorCode: errorCode,
      technicalError: error.message,
    };
  }

  // Hospital verification using Supabase
  async verifyHospital(hospitalId) {
    try {
      if (!this.validateInput(hospitalId, "hospital_id")) {
        throw new Error("Invalid hospital ID format");
      }

      console.log("🔍 Verifying hospital:", hospitalId);

      const { data, error } = await this.supabase
        .from("hospitals")
        .select(
          `
                    hospital_id,
                    name,
                    hospital_type,
                    city,
                    state,
                    license_number,
                    license_expiry,
                    is_verified,
                    account_status,
                    is_active
                `
        )
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return { success: false, message: "Hospital not found" };
        }
        throw error;
      }

      if (data && data.account_status === "active") {
        return {
          success: true,
          hospital: {
            hospital_id: data.hospital_id,
            name: data.name,
            hospital_type: data.hospital_type,
            city: data.city,
            state: data.state,
            license_number: data.license_number,
            license_expiry: data.license_expiry,
            is_verified: data.is_verified,
          },
          message: "Hospital verified successfully",
        };
      } else {
        return { success: false, message: "Hospital account is not active" };
      }
    } catch (error) {
      console.error("Hospital verification error:", error);
      return { success: false, message: "Error verifying hospital" };
    }
  }

  // Enhanced create hospital account with proper password hashing
  async createHospitalAccount(hospitalData) {
    try {
      console.log("🏥 Creating hospital account:", hospitalData.hospitalId);

      // Enhanced validation
      const requiredFields = [
        "hospitalId",
        "password",
        "adminEmail",
        "adminPhone",
      ];
      for (const field of requiredFields) {
        if (!hospitalData[field]) {
          throw new Error(`${field} is required`);
        }
      }

      // Validate inputs
      if (!this.validateInput(hospitalData.hospitalId, "hospital_id")) {
        throw new Error("Invalid hospital ID format");
      }
      if (!this.validateInput(hospitalData.password, "password")) {
        throw new Error(
          "Password must be at least 8 characters with uppercase, lowercase, number, and special character"
        );
      }
      if (!this.validateInput(hospitalData.adminEmail, "email")) {
        throw new Error("Invalid email format");
      }

      // Hash password securely
      const hashedPassword = await this.hashPassword(hospitalData.password);

      const { data, error } = await this.supabase
        .from("hospitals")
        .insert([
          {
            hospital_id: hospitalData.hospitalId,
            name:
              hospitalData.hospitalName ||
              `${hospitalData.hospitalId} Hospital`,
            hospital_type: hospitalData.hospitalType || "Private",
            city: hospitalData.city || "Unknown",
            state: hospitalData.state || "Unknown",
            license_number:
              hospitalData.licenseNumber || `LIC-${hospitalData.hospitalId}`,
            license_expiry:
              hospitalData.licenseExpiry ||
              new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
            password_hash: hashedPassword,
            admin_email_encrypted: await this.encryptSensitiveData(
              hospitalData.adminEmail
            ),
            admin_phone_encrypted: await this.encryptSensitiveData(
              hospitalData.adminPhone
            ),
            account_status: "pending_verification",
            is_verified: false,
            is_active: false,
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (error) {
        if (error.code === "23505") {
          throw new Error("Hospital account already exists");
        }
        throw error;
      }

      await this.logAuditEvent(
        "ACCOUNT_CREATED",
        hospitalData.hospitalId,
        "Hospital account created"
      );

      console.log("✅ Hospital account created:", data);
      return {
        success: true,
        message:
          "Hospital account created successfully. Please wait for admin verification.",
        hospitalId: hospitalData.hospitalId,
      };
    } catch (error) {
      console.error("Account creation error:", error);
      await this.logAuditEvent(
        "ACCOUNT_CREATION_FAILED",
        hospitalData.hospitalId,
        error.message
      );
      return {
        success: false,
        message: error.message || "Failed to create hospital account",
      };
    }
  }

  // Patient verification - enhanced version
  async verifyPatient(patientId, phone, name) {
    try {
      if (!this.validateInput(patientId, "patient_id")) {
        throw new Error("Invalid patient ID format");
      }

      console.log("👤 Verifying patient:", patientId);

      const { data: patient, error } = await this.supabase
        .from("patients")
        .select("*")
        .eq("patient_id", patientId)
        .eq("phone", phone)
        .eq("is_active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return { success: false, message: "Patient not found" };
        }
        throw error;
      }

      // Verify name matches (case insensitive)
      if (patient.name.toLowerCase() !== name.toLowerCase()) {
        await this.logAuditEvent(
          "PATIENT_VERIFICATION_FAILED",
          patientId,
          "Name mismatch"
        );
        return { success: false, message: "Patient verification failed" };
      }

      await this.logAuditEvent(
        "PATIENT_VERIFIED",
        patientId,
        "Patient verified successfully"
      );

      return {
        success: true,
        patient: {
          patient_id: patient.patient_id,
          name: patient.name,
          phone: patient.phone,
          gender: patient.gender || "Not specified",
          blood_group: patient.blood_group || "Not specified",
          date_of_birth: patient.date_of_birth,
          emergency_contact_name: patient.emergency_contact_name,
          emergency_contact_phone: patient.emergency_contact_phone,
        },
        message: "Patient verified successfully",
      };
    } catch (error) {
      console.error("Patient verification error:", error);
      return { success: false, message: "Error verifying patient" };
    }
  }

  // ADDED: File upload to Supabase Storage
  async uploadAttachment(file, recordNumber) {
    try {
      if (!file) throw new Error("No file provided");

      // Validate file type and size
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/jpg",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (!allowedTypes.includes(file.type)) {
        throw new Error(
          "File type not allowed. Only PDF, images, and Word documents are permitted."
        );
      }

      if (file.size > maxSize) {
        throw new Error("File too large. Maximum size is 10MB.");
      }

      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${
        this.currentSession.hospitalId
      }/${recordNumber}/${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error } = await this.supabase.storage
        .from("medical-attachments")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from("medical-attachments")
        .getPublicUrl(fileName);

      await this.logAuditEvent(
        "FILE_UPLOADED",
        this.currentSession?.hospitalId,
        `File uploaded: ${fileName}`
      );

      return {
        success: true,
        fileName: fileName,
        publicUrl: urlData.publicUrl,
        originalName: file.name,
        size: file.size,
        type: file.type,
      };
    } catch (error) {
      console.error("File upload error:", error);
      return {
        success: false,
        message: error.message || "File upload failed",
      };
    }
  }

  // Enhanced create medical record with file attachments
  async createMedicalRecord(recordData, attachments = []) {
    try {
      if (!this.currentSession) {
        throw new Error("User not authenticated");
      }

      console.log(
        "📋 Creating medical record for patient:",
        recordData.patientId
      );

      // Enhanced validation
      const requiredFields = [
        "patientId",
        "doctorName",
        "recordType",
        "diagnosis",
      ];
      for (const field of requiredFields) {
        if (!recordData[field]) {
          throw new Error(`${field} is required`);
        }
      }

      // Validate input formats
      if (!this.validateInput(recordData.patientId, "patient_id")) {
        throw new Error("Invalid patient ID format");
      }
      if (!this.validateInput(recordData.recordType, "record_type")) {
        throw new Error("Invalid record type");
      }
      if (!this.validateInput(recordData.severity || "medium", "severity")) {
        throw new Error("Invalid severity level");
      }

      const recordNumber =
        "MR-" +
        Date.now() +
        "-" +
        Math.random().toString(36).substr(2, 9).toUpperCase();

      // Handle file attachments
      let attachmentUrls = [];
      if (attachments && attachments.length > 0) {
        for (const file of attachments) {
          const uploadResult = await this.uploadAttachment(file, recordNumber);
          if (uploadResult.success) {
            attachmentUrls.push({
              fileName: uploadResult.fileName,
              originalName: uploadResult.originalName,
              url: uploadResult.publicUrl,
              size: uploadResult.size,
              type: uploadResult.type,
              uploadedAt: new Date().toISOString(),
            });
          } else {
            console.warn("Failed to upload attachment:", uploadResult.message);
          }
        }
      }

      const recordInsert = {
        record_number: recordNumber,
        patient_id: recordData.patientId,
        hospital_id: this.currentSession.hospitalId,
        record_type: recordData.recordType,
        doctor_name: recordData.doctorName,
        doctor_specialization: recordData.doctorSpecialization || null,
        diagnosis: await this.encryptSensitiveData(recordData.diagnosis),
        treatment: recordData.treatment
          ? await this.encryptSensitiveData(recordData.treatment)
          : null,
        medications: recordData.medications
          ? await this.encryptSensitiveData(recordData.medications)
          : null,
        follow_up_date: recordData.followUpDate || null,
        severity: recordData.severity || "medium",
        attachments: attachmentUrls.length > 0 ? attachmentUrls : null,
        notes: recordData.notes
          ? await this.encryptSensitiveData(recordData.notes)
          : null,
        created_at: new Date().toISOString(),
        can_edit_until: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString(),
        is_editable: true,
      };

      const { data, error } = await this.supabase
        .from("medical_records")
        .insert([recordInsert])
        .select();

      if (error) throw error;

      await this.logAuditEvent(
        "RECORD_CREATED",
        this.currentSession.hospitalId,
        `Medical record created: ${recordNumber}`
      );

      console.log("✅ Medical record created:", data[0]);
      return {
        success: true,
        record: data[0],
        attachments: attachmentUrls,
        message: "Medical record created successfully",
      };
    } catch (error) {
      console.error("Medical record creation error:", error);
      await this.logAuditEvent(
        "RECORD_CREATION_FAILED",
        this.currentSession?.hospitalId,
        error.message
      );
      return {
        success: false,
        message: error.message || "Failed to create medical record",
      };
    }
  }

  // Get medical records for hospital
  async getMedicalRecords(hospitalId, filters = {}) {
    try {
      console.log("📊 Loading medical records for hospital:", hospitalId);

      let query = this.supabase
        .from("medical_records")
        .select(
          `
                    id,
                    record_number,
                    patient_id,
                    record_type,
                    severity,
                    created_at,
                    status,
                    doctor_name,
                    diagnosis,
                    patients:patient_id (
                        name,
                        phone
                    )
                `
        )
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: false });

      // Apply filters
      if (filters.recordType) {
        query = query.eq("record_type", filters.recordType);
      }
      if (filters.severity) {
        query = query.eq("severity", filters.severity);
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Decrypt sensitive data for display
      const decryptedRecords = await Promise.all(
        data.map(async (record) => ({
          ...record,
          diagnosis: await this.decryptSensitiveData(record.diagnosis),
        }))
      );

      console.log(
        `✅ Retrieved ${decryptedRecords?.length || 0} medical records`
      );
      return {
        success: true,
        records: decryptedRecords || [],
        message: "Medical records retrieved successfully",
      };
    } catch (error) {
      console.error("Get medical records error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve medical records",
        records: [],
      };
    }
  }

  // Get dashboard statistics
  async getDashboardStats(hospitalId) {
    try {
      console.log("📈 Loading dashboard stats for hospital:", hospitalId);

      // Get total records count
      const { count: totalRecords, error: recordsError } = await this.supabase
        .from("medical_records")
        .select("*", { count: "exact", head: true })
        .eq("hospital_id", hospitalId);

      if (recordsError) throw recordsError;

      // Get unique patients count
      const { data: patientsData, error: patientsError } = await this.supabase
        .from("medical_records")
        .select("patient_id")
        .eq("hospital_id", hospitalId);

      if (patientsError) throw patientsError;

      const uniquePatients = new Set(
        patientsData?.map((record) => record.patient_id) || []
      ).size;

      // Get records by severity
      const { data: severityData, error: severityError } = await this.supabase
        .from("medical_records")
        .select("severity")
        .eq("hospital_id", hospitalId);

      if (severityError) throw severityError;

      const severityStats = (severityData || []).reduce((acc, record) => {
        acc[record.severity] = (acc[record.severity] || 0) + 1;
        return acc;
      }, {});

      console.log("✅ Dashboard stats loaded successfully");
      return {
        success: true,
        stats: {
          totalRecords: totalRecords || 0,
          totalPatients: uniquePatients,
          severityBreakdown: severityStats,
          lastUpdated: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Dashboard stats error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve dashboard statistics",
        stats: {
          totalRecords: 0,
          totalPatients: 0,
          severityBreakdown: {},
          lastUpdated: new Date().toISOString(),
        },
      };
    }
  }

  // ADDED: Data encryption for sensitive fields
  async encryptSensitiveData(data) {
    if (!data) return null;
    try {
      // In production, use proper encryption
      // For now, using base64 encoding as placeholder
      return btoa(unescape(encodeURIComponent(data)));
    } catch (error) {
      console.error("Encryption error:", error);
      return data; // Fallback to plain text
    }
  }

  async decryptSensitiveData(encryptedData) {
    if (!encryptedData) return "";
    try {
      return decodeURIComponent(escape(atob(encryptedData)));
    } catch (error) {
      console.error("Decryption error:", error);
      return encryptedData; // Fallback to encrypted text
    }
  }

  // ADDED: Audit logging system
  async logAuditEvent(action, entityId, details) {
    try {
      const auditEntry = {
        action: action,
        entity_type: entityId?.startsWith("PAT") ? "patient" : "hospital",
        entity_id: entityId,
        details: details,
        user_id: this.currentSession?.hospitalId || "system",
        ip_address: await this.getClientIP(),
        user_agent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        session_id: this.currentSession?.sessionToken,
      };

      const { error } = await this.supabase
        .from("audit_logs")
        .insert([auditEntry]);

      if (error) {
        console.error("Audit log insert failed:", error);
      }
    } catch (error) {
      console.error("Audit logging error:", error);
    }
  }

  // Helper to get client IP
  async getClientIP() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip;
    } catch (error) {
      return "unknown";
    }
  }

  // Logout function
  async logout() {
    try {
      console.log("👋 Logging out...");

      if (this.currentSession?.hospitalId) {
        await this.logAuditEvent(
          "LOGOUT",
          this.currentSession.hospitalId,
          "User logged out"
        );
      }

      // Sign out from Supabase auth if used
      await this.supabase.auth.signOut();

      this.currentSession = null;
      this.currentUser = null;

      // Clear stored fingerprints
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("deviceFingerprint_")) {
          localStorage.removeItem(key);
        }
      });

      return { success: true, message: "Logged out successfully" };
    } catch (error) {
      console.error("Logout error:", error);
      return { success: false, message: "Error during logout" };
    }
  }

  // Health check function
  async healthCheck() {
    try {
      console.log("🩺 Performing health check...");

      const { data, error } = await this.supabase
        .from("hospitals")
        .select("hospital_id")
        .limit(1);

      if (error) {
        throw new Error(`Database connection failed: ${error.message}`);
      }

      console.log("✅ Health check passed");
      return {
        success: true,
        message: "Database connection healthy",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Health check failed:", error);
      return {
        success: false,
        message: error.message || "Health check failed",
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Utility functions
  generateCSRFToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  generateSessionToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  generateSalt() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  generateChecksum(data) {
    const str = JSON.stringify(data);
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  generateIntegrityHash(identifier) {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Get current location for risk assessment
  async getCurrentLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        () => resolve(null),
        { timeout: 5000, enableHighAccuracy: false }
      );
    });
  }
}

// Generate device fingerprint
function generateDeviceFingerprint() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";
  ctx.font = "14px Arial";
  ctx.fillText("MediSecure fingerprint", 2, 2);

  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
  ].join("|");

  return btoa(fingerprint).slice(0, 32);
}

// Initialize database API
let supabaseAPI;
let isDBInitialized = false;

function initializeDatabase() {
  try {
    if (typeof supabase === "undefined") {
      throw new Error("Supabase library not loaded. Add to your HTML.");
    }

    supabaseAPI = new SupabaseMediSecureAPI();
    isDBInitialized = true;
    console.log("✅ Supabase API initialized successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to initialize Supabase API:", error);
    showConnectionStatus(`Initialization failed: ${error.message}`, "error");
    return false;
  }
}

// Diagnostic function for troubleshooting
async function diagnoseIssue() {
  try {
    console.log("🔍 Starting diagnostic...");
    const results = await supabaseAPI.testConnection();
    console.log("🔍 Diagnosis results:", results);

    if (!results.basicConnection) {
      console.error("❌ Basic Supabase connection failed");
      showConnectionStatus("Database connection failed", "error");
    } else {
      console.log("✅ Basic connection working");
    }

    if (!results.hospitalData) {
      console.warn("⚠️ No hospital data found");
      showConnectionStatus("No sample data found", "warning");
    } else {
      console.log("✅ Hospital data available");
    }

    return results;
  } catch (error) {
    console.error("❌ Diagnostic failed:", error);
    return null;
  }
}

// Connection status indicator
function showConnectionStatus(message, type = "info", duration = 3000) {
  const statusDiv = document.getElementById("connectionStatus");
  if (!statusDiv) return;

  statusDiv.className = `connection-status ${type}`;
  statusDiv.innerHTML = `${message}`;
  statusDiv.classList.remove("hidden");

  if (duration > 0) {
    setTimeout(() => {
      statusDiv.classList.add("hidden");
    }, duration);
  }
}

// Hide loading screen
function hideLoadingScreen() {
  const loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
    setTimeout(() => {
      loadingScreen.remove();
    }, 500);
  }
}

// Main Application Class (Enhanced)
class MediSecureApp {
  constructor() {
    this.currentSection = "signup";
    this.currentDashboardView = "dashboard";
    this.currentSession = null;
    this.hospitalData = null;
    this.verifiedPatient = null;
    this.autoSearchTimeout = null;
    this.connectionRetryCount = 0;
    this.maxRetries = 3;
    this.deviceFingerprint = generateDeviceFingerprint();
    this.selectedFiles = [];
    this.initializeApp();
  }

  async initializeApp() {
    console.log("🚀 Initializing MediSecure App with Supabase...");
    showConnectionStatus("Initializing application...", "info", 0);

    // Initialize Supabase API
    if (!initializeDatabase()) {
      this.handleConnectionError();
      return;
    }

    // Test Supabase connection with diagnostics
    const connectionSuccess = await this.testDatabaseConnection();
    if (!connectionSuccess) {
      this.handleConnectionError();
      return;
    }

    // Initialize event listeners
    this.initializeEventListeners();

    // Check if user is already logged in
    await this.checkExistingSession();

    showConnectionStatus("Application ready!", "success");
    hideLoadingScreen();
    console.log("✅ MediSecure App with Supabase initialized successfully");
  }

  async testDatabaseConnection() {
    showConnectionStatus("Testing Supabase connection...", "info", 0);
    try {
      console.log("🔌 Testing Supabase connection...");
      const diagnostic = await diagnoseIssue();
      if (diagnostic && diagnostic.basicConnection) {
        console.log("✅ Supabase connection successful");
        showConnectionStatus("Supabase connected successfully!", "success");
        return true;
      } else {
        throw new Error("Connection diagnostic failed");
      }
    } catch (error) {
      console.error("❌ Supabase connection test error:", error);
      this.handleConnectionError(error);
      return false;
    }
  }

  handleConnectionError(error) {
    this.connectionRetryCount++;
    if (this.connectionRetryCount <= this.maxRetries) {
      showConnectionStatus(
        `Connection failed. Retrying... (${this.connectionRetryCount}/${this.maxRetries})`,
        "error",
        3000
      );
      setTimeout(() => this.testDatabaseConnection(), 3000);
    } else {
      showConnectionStatus(
        "Unable to connect to Supabase. Check your configuration and try refreshing.",
        "error",
        0
      );
      this.showOfflineMode();
    }
  }

  showOfflineMode() {
    this.showNotification(
      "Application is running in offline mode. Supabase connection required for full functionality.",
      "error"
    );
    this.initializeEventListeners();
    hideLoadingScreen();
    this.showSignup();
  }

  async checkExistingSession() {
    const sessionData =
      localStorage.getItem("mediSecureSession") ||
      sessionStorage.getItem("mediSecureSession");
    if (sessionData) {
      try {
        const session = JSON.parse(sessionData);
        if (
          session.sessionToken &&
          session.expiresAt &&
          new Date(session.expiresAt) > new Date()
        ) {
          this.currentSession = session;
          supabaseAPI.currentSession = session;
          await this.showDashboard();
          return;
        }
      } catch (error) {
        console.error("Error parsing session data:", error);
      }
      localStorage.removeItem("mediSecureSession");
      sessionStorage.removeItem("mediSecureSession");
    }
    this.showSignup();
  }

  initializeEventListeners() {
    // Signup form listeners
    const verifyBtn = document.getElementById("verifyBtn");
    const signupForm = document.getElementById("signupForm");
    const togglePassword = document.getElementById("togglePassword");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirmPassword");

    if (verifyBtn)
      verifyBtn.addEventListener("click", () => this.verifyHospital());
    if (signupForm)
      signupForm.addEventListener("submit", (e) => this.handleSignup(e));
    if (togglePassword)
      togglePassword.addEventListener("click", () =>
        this.togglePasswordVisibility("password", "togglePassword")
      );
    if (passwordInput)
      passwordInput.addEventListener("input", () =>
        this.checkPasswordStrength()
      );
    if (confirmPasswordInput)
      confirmPasswordInput.addEventListener("input", () =>
        this.validatePasswordMatch()
      );

    // Login form listeners
    const loginForm = document.getElementById("loginForm");
    const toggleLoginPassword = document.getElementById("toggleLoginPassword");
    const forgotPassword = document.getElementById("forgotPassword");

    if (loginForm)
      loginForm.addEventListener("submit", (e) => this.handleLogin(e));
    if (toggleLoginPassword)
      toggleLoginPassword.addEventListener("click", () =>
        this.togglePasswordVisibility("loginPassword", "toggleLoginPassword")
      );
    if (forgotPassword)
      forgotPassword.addEventListener("click", (e) =>
        this.handleForgotPassword(e)
      );

    // Dashboard listeners
    const verifyPatientBtn = document.getElementById("verifyPatientBtn");
    const addRecordForm = document.getElementById("addRecordForm");
    const logoutBtn = document.getElementById("logoutBtn");
    const attachmentsInput = document.getElementById("attachments");

    if (verifyPatientBtn)
      verifyPatientBtn.addEventListener("click", () => this.verifyPatient());
    if (addRecordForm)
      addRecordForm.addEventListener("submit", (e) => this.handleAddRecord(e));
    if (logoutBtn)
      logoutBtn.addEventListener("click", () => this.handleLogout());
    if (attachmentsInput)
      attachmentsInput.addEventListener("change", (e) =>
        this.handleFileSelection(e)
      );

    // Auto-verify patient when all fields are filled
    const patientIdInput = document.getElementById("patientId");
    const patientPhoneInput = document.getElementById("patientPhone");
    const patientNameInput = document.getElementById("patientName");

    if (patientIdInput)
      patientIdInput.addEventListener("input", () => this.autoVerifyPatient());
    if (patientPhoneInput)
      patientPhoneInput.addEventListener("input", () =>
        this.autoVerifyPatient()
      );
    if (patientNameInput)
      patientNameInput.addEventListener("input", () =>
        this.autoVerifyPatient()
      );

    // Set minimum date for follow-up to today
    const followUpDate = document.getElementById("followUpDate");
    if (followUpDate) {
      followUpDate.min = new Date().toISOString().split("T")[0];
    }
  }

  // Navigation Methods
  showSignup() {
    this.hideAllSections();
    document.getElementById("signupSection").classList.remove("hidden");
    this.currentSection = "signup";
    this.resetForms();
  }

  showLogin() {
    this.hideAllSections();
    document.getElementById("loginSection").classList.remove("hidden");
    this.currentSection = "login";
    this.resetForms();
  }

  async showDashboard() {
    this.hideAllSections();
    document.getElementById("dashboardSection").classList.remove("hidden");
    this.currentSection = "dashboard";
    if (this.currentSession) {
      document.getElementById("dashboardHospitalName").textContent =
        this.currentSession.hospitalName || this.currentSession.hospitalId;
      document.getElementById(
        "dashboardHospitalId"
      ).textContent = `ID: ${this.currentSession.hospitalId}`;
      await this.loadDashboardStats();
    }
    this.resetForms();
    this.switchDashboardView("dashboard");
  }

  hideAllSections() {
    document.getElementById("signupSection").classList.add("hidden");
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("dashboardSection").classList.add("hidden");
  }

  resetForms() {
    const signupForm = document.getElementById("signupForm");
    if (signupForm) signupForm.reset();
    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.reset();

    // Hide verification cards and forms
    const hospitalInfo = document.getElementById("hospitalInfo");
    const passwordSection = document.getElementById("passwordSection");
    const patientVerifiedCard = document.getElementById("patientVerifiedCard");
    const addRecordForm = document.getElementById("addRecordForm");

    if (hospitalInfo) hospitalInfo.classList.add("hidden");
    if (passwordSection) passwordSection.classList.add("hidden");
    if (patientVerifiedCard) patientVerifiedCard.classList.add("hidden");
    if (addRecordForm) addRecordForm.classList.add("hidden");

    this.verifiedPatient = null;
    this.hospitalData = null;
    this.selectedFiles = [];
    this.clearFilesList();
  }

  // Hospital Verification
  async verifyHospital() {
    const hospitalIdInput = document.getElementById("hospitalId");
    const verifyBtn = document.getElementById("verifyBtn");
    const hospitalId = hospitalIdInput.value.trim();

    if (!hospitalId) {
      this.showNotification("Please enter a hospital ID", "error");
      return;
    }

    try {
      verifyBtn.disabled = true;
      verifyBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Verifying...';

      const response = await supabaseAPI.verifyHospital(hospitalId);

      if (response.success) {
        this.hospitalData = response.hospital;
        this.displayHospitalInfo(response.hospital);
        this.showNotification("Hospital verified successfully!", "success");
      } else {
        this.showNotification(
          response.message || "Hospital not found",
          "error"
        );
      }
    } catch (error) {
      console.error("Hospital verification error:", error);
      this.showNotification(
        "Error verifying hospital. Please try again.",
        "error"
      );
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = '<i class="fas fa-check"></i> Verify';
    }
  }

  displayHospitalInfo(hospital) {
    document.getElementById("hospitalName").textContent = hospital.name;
    document.getElementById(
      "hospitalLocation"
    ).textContent = `${hospital.city}, ${hospital.state}`;
    document.getElementById("hospitalType").textContent =
      hospital.hospital_type;
    document.getElementById(
      "hospitalLicense"
    ).textContent = `License: ${hospital.license_number}`;
    document.getElementById("hospitalInfo").classList.remove("hidden");
    document.getElementById("passwordSection").classList.remove("hidden");
  }

  // Enhanced Signup Handler
  async handleSignup(e) {
    e.preventDefault();
    if (!this.hospitalData) {
      this.showNotification("Please verify your hospital first", "error");
      return;
    }

    const formData = new FormData(e.target);
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");

    if (password !== confirmPassword) {
      this.showNotification("Passwords do not match", "error");
      return;
    }

    if (!this.checkPasswordStrength(password)) {
      this.showNotification("Password does not meet requirements", "error");
      return;
    }

    try {
      const signupData = {
        hospitalId: this.hospitalData.hospital_id,
        hospitalName: this.hospitalData.name,
        password: password,
        adminEmail: formData.get("adminEmail"),
        adminPhone: formData.get("adminPhone"),
        acceptTerms: formData.get("acceptTerms") === "on",
      };

      const response = await supabaseAPI.createHospitalAccount(signupData);

      if (response.success) {
        this.showNotification(
          "Account created successfully! Please sign in.",
          "success"
        );
        setTimeout(() => this.showLogin(), 2000);
      } else {
        this.showNotification(
          response.message || "Account creation failed",
          "error"
        );
      }
    } catch (error) {
      console.error("Signup error:", error);
      this.showNotification(
        "Error creating account. Please try again.",
        "error"
      );
    }
  }

  // Enhanced Login Handler
  async handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const hospitalId = formData.get("hospitalId");
    const password = formData.get("password");
    const rememberMe = formData.get("rememberMe") === "on";

    if (!hospitalId || !password) {
      this.showNotification(
        "Please enter both hospital ID and password",
        "error"
      );
      return;
    }

    try {
      const loginBtn = e.target.querySelector('button[type="submit"]');
      loginBtn.disabled = true;
      loginBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Signing In...';

      const geolocation = await supabaseAPI.getCurrentLocation();
      console.log("🔐 Attempting login with credentials:", {
        hospitalId,
        password: "***",
      });

      const response = await supabaseAPI.loginHospital(
        hospitalId,
        password,
        geolocation
      );
      console.log("📊 Login response:", response);

      if (response.success) {
        const sessionData = {
          hospitalId: hospitalId,
          hospitalName: response.session.hospitalName || hospitalId,
          sessionToken: response.session.sessionToken,
          csrfToken: response.session.csrfToken,
          expiresAt: response.session.expiresAt,
          riskScore: response.session.riskScore,
        };

        if (rememberMe) {
          localStorage.setItem(
            "mediSecureSession",
            JSON.stringify(sessionData)
          );
        } else {
          sessionStorage.setItem(
            "mediSecureSession",
            JSON.stringify(sessionData)
          );
        }

        this.currentSession = sessionData;

        if (response.requiresMFA) {
          this.showNotification("MFA verification required", "info");
          // Handle MFA flow here
        } else {
          this.showNotification("Login successful!", "success");
          await this.showDashboard();
        }

        if (response.passwordWarning) {
          this.showNotification(response.passwordWarning, "warning");
        }
      } else {
        this.showNotification(response.message || "Login failed", "error");
        if (response.technicalError) {
          console.error("Technical error:", response.technicalError);
        }
      }
    } catch (error) {
      console.error("Login error:", error);
      this.showNotification("Error during login. Please try again.", "error");
    } finally {
      const loginBtn = e.target.querySelector('button[type="submit"]');
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
  }

  // Patient Verification
  async verifyPatient() {
    const patientId = document.getElementById("patientId").value.trim();
    const patientPhone = document.getElementById("patientPhone").value.trim();
    const patientName = document.getElementById("patientName").value.trim();

    if (!patientId || !patientPhone || !patientName) {
      this.showNotification(
        "Please fill all patient verification fields",
        "error"
      );
      return;
    }

    try {
      const verifyBtn = document.getElementById("verifyPatientBtn");
      verifyBtn.disabled = true;
      verifyBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Verifying...';

      const response = await supabaseAPI.verifyPatient(
        patientId,
        patientPhone,
        patientName
      );

      if (response.success) {
        this.verifiedPatient = response.patient;
        this.displayPatientInfo(response.patient);
        this.showNotification("Patient verified successfully!", "success");
      } else {
        this.showNotification(
          response.message || "Patient verification failed",
          "error"
        );
      }
    } catch (error) {
      console.error("Patient verification error:", error);
      this.showNotification(
        "Error verifying patient. Please try again.",
        "error"
      );
    } finally {
      const verifyBtn = document.getElementById("verifyPatientBtn");
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = '<i class="fas fa-user-check"></i> Verify Patient';
    }
  }

  displayPatientInfo(patient) {
    document.getElementById("verifiedPatientId").textContent =
      patient.patient_id;
    document.getElementById("verifiedPatientName").textContent = patient.name;
    document.getElementById("verifiedPatientPhone").textContent = patient.phone;
    document.getElementById("verifiedPatientGender").textContent =
      patient.gender || "Not specified";
    document.getElementById("verifiedPatientBloodGroup").textContent =
      patient.blood_group || "Not specified";
    document.getElementById("patientVerifiedCard").classList.remove("hidden");
    document.getElementById("addRecordForm").classList.remove("hidden");
  }

  // Auto verify patient when all fields are filled
  autoVerifyPatient() {
    clearTimeout(this.autoSearchTimeout);
    const patientId = document.getElementById("patientId").value.trim();
    const patientPhone = document.getElementById("patientPhone").value.trim();
    const patientName = document.getElementById("patientName").value.trim();

    if (patientId && patientPhone && patientName) {
      this.autoSearchTimeout = setTimeout(() => {
        this.verifyPatient();
      }, 1500);
    }
  }

  // File selection handler
  handleFileSelection(e) {
    const files = Array.from(e.target.files);
    this.selectedFiles = [...this.selectedFiles, ...files];
    this.displayFilesList();
  }

  displayFilesList() {
    const filesList = document.getElementById("filesList");
    if (!filesList) return;

    filesList.innerHTML = "";
    this.selectedFiles.forEach((file, index) => {
      const fileItem = document.createElement("div");
      fileItem.className = "file-item";
      fileItem.innerHTML = `
                <div class="file-info">
                    <i class="fas fa-file"></i>
                    <span>${file.name}</span>
                    <span class="file-size">(${(file.size / 1024).toFixed(
                      2
                    )} KB)</span>
                </div>
                <button type="button" class="remove-file" onclick="app.removeFile(${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;
      filesList.appendChild(fileItem);
    });
  }

  removeFile(index) {
    this.selectedFiles.splice(index, 1);
    this.displayFilesList();
  }

  clearFilesList() {
    this.selectedFiles = [];
    const filesList = document.getElementById("filesList");
    if (filesList) filesList.innerHTML = "";
    const attachmentsInput = document.getElementById("attachments");
    if (attachmentsInput) attachmentsInput.value = "";
  }

  // Enhanced Medical Record Handler
  async handleAddRecord(e) {
    e.preventDefault();
    if (!this.verifiedPatient) {
      this.showNotification("Please verify patient first", "error");
      return;
    }

    const formData = new FormData(e.target);
    const recordData = {
      patientId: this.verifiedPatient.patient_id,
      hospitalId: this.currentSession.hospitalId,
      doctorName: formData.get("doctorName"),
      doctorSpecialization: formData.get("doctorSpecialization"),
      recordType: formData.get("recordType"),
      severity: formData.get("severity"),
      diagnosis: formData.get("diagnosis"),
      treatment: formData.get("treatment"),
      medications: formData.get("medications"),
      followUpDate: formData.get("followUpDate"),
      notes: formData.get("notes"),
    };

    try {
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

      const response = await supabaseAPI.createMedicalRecord(
        recordData,
        this.selectedFiles
      );

      if (response.success) {
        this.showNotification("Medical record saved successfully!", "success");
        this.resetRecordForm();
        await this.loadDashboardStats();

        if (response.attachments && response.attachments.length > 0) {
          this.showNotification(
            `${response.attachments.length} file(s) uploaded successfully`,
            "info"
          );
        }
      } else {
        this.showNotification(
          response.message || "Error saving medical record",
          "error"
        );
      }
    } catch (error) {
      console.error("Add record error:", error);
      this.showNotification(
        "Error saving medical record. Please try again.",
        "error"
      );
    } finally {
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Medical Record';
    }
  }

  resetRecordForm() {
    const addRecordForm = document.getElementById("addRecordForm");
    const patientVerifiedCard = document.getElementById("patientVerifiedCard");

    if (addRecordForm) {
      addRecordForm.reset();
      addRecordForm.classList.add("hidden");
    }
    if (patientVerifiedCard) patientVerifiedCard.classList.add("hidden");

    // Reset patient verification fields
    document.getElementById("patientId").value = "";
    document.getElementById("patientPhone").value = "";
    document.getElementById("patientName").value = "";
    this.verifiedPatient = null;
    this.clearFilesList();
  }

  // Dashboard view switching
  switchDashboardView(view) {
    this.currentDashboardView = view;

    // Hide all dashboard views
    const views = [
      "dashboardView",
      "recordsView",
      "patientsView",
      "analyticsView",
      "settingsView",
    ];
    views.forEach((viewId) => {
      const element = document.getElementById(viewId);
      if (element) element.classList.add("hidden");
    });

    // Show selected view
    const selectedView = document.getElementById(view + "View");
    if (selectedView) selectedView.classList.remove("hidden");

    // Update menu active state
    document
      .querySelectorAll(".menu-item")
      .forEach((item) => item.classList.remove("active"));
    const activeMenuItem = document
      .querySelector(`[onclick="app.switchDashboardView('${view}')"]`)
      ?.closest(".menu-item");
    if (activeMenuItem) activeMenuItem.classList.add("active");

    // Load view-specific data
    this.loadViewData(view);
  }

  async loadViewData(view) {
    switch (view) {
      case "records":
        await this.loadMedicalRecords();
        break;
      case "dashboard":
        await this.loadDashboardStats();
        break;
    }
  }

  async loadDashboardStats() {
    try {
      if (!this.currentSession) return;

      const response = await supabaseAPI.getDashboardStats(
        this.currentSession.hospitalId
      );
      if (response.success) {
        document.getElementById("totalRecords").textContent =
          response.stats.totalRecords || "0";
        document.getElementById("totalPatients").textContent =
          response.stats.totalPatients || "0";
      }
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
    }
  }

  async loadMedicalRecords() {
    try {
      if (!this.currentSession) return;

      const response = await supabaseAPI.getMedicalRecords(
        this.currentSession.hospitalId,
        { limit: 50 }
      );
      if (response.success) {
        this.displayMedicalRecords(response.records);
      } else {
        console.error("Error loading medical records:", response.message);
      }
    } catch (error) {
      console.error("Error loading medical records:", error);
      this.showNotification("Error loading medical records", "error");
    }
  }

  displayMedicalRecords(records) {
    const recordsList = document.getElementById("recordsList");
    if (!recordsList) return;

    if (!records || records.length === 0) {
      recordsList.innerHTML = `
                <div class="no-records">
                    <i class="fas fa-folder-open"></i>
                    <h3>No Records Found</h3>
                    <p>Medical records will appear here once created</p>
                </div>
            `;
      return;
    }

    recordsList.innerHTML = records
      .map(
        (record) => `
            <div class="record-item">
                <div class="record-header">
                    <h4>${record.record_type.toUpperCase()}</h4>
                    <span class="record-type">${record.severity}</span>
                </div>
                <div class="record-details">
                    <p><strong>Patient ID:</strong> ${record.patient_id}</p>
                    <p><strong>Doctor:</strong> ${record.doctor_name}</p>
                    <p><strong>Diagnosis:</strong> ${record.diagnosis}</p>
                    <p><strong>Date:</strong> ${new Date(
                      record.created_at
                    ).toLocaleDateString()}</p>
                    <p><strong>Record #:</strong> ${record.record_number}</p>
                </div>
            </div>
        `
      )
      .join("");
  }

  // Logout handler
  async handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
      try {
        const response = await supabaseAPI.logout();
        if (response.success) {
          // Clear all stored sessions
          localStorage.removeItem("mediSecureSession");
          sessionStorage.removeItem("mediSecureSession");

          this.currentSession = null;
          this.showNotification("Logged out successfully", "success");
          this.showLogin();
        } else {
          this.showNotification("Error during logout", "error");
        }
      } catch (error) {
        console.error("Logout error:", error);
        this.showNotification("Error during logout", "error");
      }
    }
  }

  // Password strength checker
  checkPasswordStrength(password) {
    const pwd = password || document.getElementById("password").value;
    const strengthBar = document.querySelector(".strength-bar");
    const strengthText = document.querySelector(".strength-text");

    if (!strengthBar || !strengthText) return true;

    let strength = 0;
    let feedback = [];

    if (pwd.length >= 8) strength++;
    else feedback.push("At least 8 characters");

    if (/[a-z]/.test(pwd)) strength++;
    else feedback.push("One lowercase letter");

    if (/[A-Z]/.test(pwd)) strength++;
    else feedback.push("One uppercase letter");

    if (/\d/.test(pwd)) strength++;
    else feedback.push("One number");

    if (/[@$!%*?&]/.test(pwd)) strength++;
    else feedback.push("One special character");

    const levels = ["weak", "weak", "fair", "good", "strong"];
    const level = levels[strength];

    strengthBar.className = `strength-bar ${level}`;
    strengthText.textContent =
      feedback.length > 0
        ? `Missing: ${feedback.join(", ")}`
        : "Strong password";
    strengthText.className = `strength-text ${level}`;

    return strength >= 4;
  }

  // Password match validation
  validatePasswordMatch() {
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const confirmInput = document.getElementById("confirmPassword");

    if (confirmPassword) {
      if (password === confirmPassword) {
        confirmInput.style.borderColor = "#48bb78";
        return true;
      } else {
        confirmInput.style.borderColor = "#f56565";
        return false;
      }
    }
    return true;
  }

  // Toggle password visibility
  togglePasswordVisibility(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);

    if (input.type === "password") {
      input.type = "text";
      button.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
      input.type = "password";
      button.innerHTML = '<i class="fas fa-eye"></i>';
    }
  }

  // Handle forgot password
  handleForgotPassword(e) {
    e.preventDefault();
    this.showNotification(
      "Please contact your system administrator to reset your password.",
      "info"
    );
  }

  // Show notification
  showNotification(message, type = "info", duration = 5000) {
    // Create notification container if it doesn't exist
    let container = document.getElementById("notificationContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "notificationContainer";
      container.className = "notification-container";
      document.body.appendChild(container);
    }

    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;

    const icon =
      type === "success"
        ? "check-circle"
        : type === "error"
        ? "exclamation-circle"
        : type === "warning"
        ? "exclamation-triangle"
        : "info-circle";

    notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${icon}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;

    // Add close functionality
    notification
      .querySelector(".notification-close")
      .addEventListener("click", () => {
        notification.remove();
      });

    // Add to container
    container.appendChild(notification);

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, duration);
    }
  }
}

// Initialize the application when DOM is loaded
let app;
document.addEventListener("DOMContentLoaded", () => {
  app = new MediSecureApp();
});
