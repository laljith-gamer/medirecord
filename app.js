// Supabase Configuration - Replace with your actual credentials
const SUPABASE_URL = "https://vecyxrpwaaafvkbkqqpl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlY3l4cnB3YWFhZnZrYmtxcXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNjc4MDgsImV4cCI6MjA3Mzk0MzgwOH0._4uxQMsFvP4ypRzzwwraIxJTXyIjmuLZlmckcXp6orI";

    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlcG1hY25rbWR0ZGJxYWdkdnR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5OTg1ODgsImV4cCI6MjA3MzU3NDU4OH0.VTjfkwAnk40zUcpu0qTojNOgFRY3W3XrvputrrTM4w0",
// Initialize Supabase with comprehensive error handling
let supabase;
let isSupabaseInitialized = false;

function initializeSupabase() {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Please update Supabase credentials in app.js");
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    isSupabaseInitialized = true;
    console.log("âœ… Supabase initialized successfully");
    return true;
  } catch (error) {
    console.error("âŒ Failed to initialize Supabase:", error);
    showConnectionStatus("Failed to initialize database connection", "error");
    return false;
  }
}

// Connection status indicator
function showConnectionStatus(message, type = "info", duration = 3000) {
  const statusDiv = document.getElementById("connectionStatus");
  if (!statusDiv) return;

  statusDiv.className = `connection-status ${type}`;
  statusDiv.innerHTML = `
        <i class="fas fa-${
          type === "success"
            ? "check"
            : type === "error"
            ? "times"
            : "info-circle"
        }"></i>
        <span>${message}</span>
    `;
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

// Main Application Class
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

    this.initializeApp();
  }

  async initializeApp() {
    console.log("ðŸš€ Initializing MediSecure App...");

    // Show connection status
    showConnectionStatus("Initializing application...", "info", 0);

    // Initialize Supabase
    if (!initializeSupabase()) {
      this.handleConnectionError();
      return;
    }

    // Test database connection
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
    console.log("âœ… MediSecure App initialized successfully");
  }

  async testDatabaseConnection() {
    showConnectionStatus("Testing database connection...", "info", 0);

    try {
      console.log("ðŸ”Œ Testing Supabase connection...");
      console.log("ðŸ“ URL:", SUPABASE_URL);
      console.log("ðŸ”‘ Key exists:", !!SUPABASE_ANON_KEY);

      // Test basic connection with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 10000)
      );

      const connectionPromise = supabase
        .from("hospitals")
        .select("hospital_id")
        .limit(1);

      const { data, error } = await Promise.race([
        connectionPromise,
        timeoutPromise,
      ]);

      if (error) {
        console.error("âŒ Database connection failed:", error);
        this.handleSpecificError(error);
        return false;
      }

      console.log("âœ… Database connection successful");
      showConnectionStatus("Database connected successfully!", "success");
      return true;
    } catch (error) {
      console.error("âŒ Connection test error:", error);
      this.handleConnectionError(error);
      return false;
    }
  }

  handleSpecificError(error) {
    let message = "Database connection failed";

    if (error.message.includes("Invalid API key")) {
      message = "Invalid database credentials. Please check your API key.";
    } else if (error.message.includes("not found")) {
      message = "Database table not found. Please check your database setup.";
    } else if (error.message.includes("CORS")) {
      message = "CORS error. Please check your domain settings in Supabase.";
    } else if (error.message.includes("timeout")) {
      message = "Connection timeout. Please check your internet connection.";
    } else if (error.message.includes("fetch")) {
      message = "Network error. Please check your internet connection.";
    } else {
      message = `Database error: ${error.message}`;
    }

    showConnectionStatus(message, "error", 10000);
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
        "Unable to connect to database. Please refresh the page.",
        "error",
        0
      );
      this.showOfflineMode();
    }
  }

  showOfflineMode() {
    // Show offline mode notification
    this.showNotification(
      "Application is running in offline mode. Some features may not work.",
      "error"
    );

    // Still initialize the UI
    this.initializeEventListeners();
    hideLoadingScreen();
    this.showSignup();
  }

  async checkExistingSession() {
    const sessionData =
      localStorage.getItem("hospitalSession") ||
      sessionStorage.getItem("hospitalSession");
    if (sessionData) {
      try {
        this.currentSession = JSON.parse(sessionData);
        await this.showDashboard();
      } catch (error) {
        console.error("Error parsing session data:", error);
        localStorage.removeItem("hospitalSession");
        sessionStorage.removeItem("hospitalSession");
        this.showSignup();
      }
    } else {
      this.showSignup();
    }
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

    // Auto-verify when all fields are filled
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
        this.currentSession.hospitalName;
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

  // Dashboard view switching
  switchDashboardView(view) {
    // Update current view
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
      case "patients":
        // Load patients data
        break;
      case "analytics":
        // Load analytics data
        break;
      case "settings":
        // Load settings
        break;
    }
  }

  async loadMedicalRecords() {
    if (!this.checkDatabaseAvailability()) return;

    try {
      const { data, error } = await supabase
        .from("medical_records")
        .select(
          `
                    *,
                    patients!inner(name, phone)
                `
        )
        .eq("hospital_id", this.currentSession.hospitalId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      this.displayMedicalRecords(data);
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
                    <h3>No records found</h3>
                    <p>Medical records will appear here once created</p>
                </div>
            `;
      return;
    }

    recordsList.innerHTML = records
      .map(
        (record) => `
            <div class="record-item" style="background: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 1rem; box-shadow: 0 3px 6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
                <div class="record-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4 style="margin: 0; color: #2d3748; font-size: 1.2rem;">${
                      record.patients.name
                    }</h4>
                    <span class="record-type" style="background: #667eea; color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.8rem; text-transform: capitalize;">${record.record_type.replace(
                      "_",
                      " "
                    )}</span>
                </div>
                <div class="record-details" style="margin-bottom: 1rem;">
                    <p style="margin: 0.25rem 0;"><strong>Diagnosis:</strong> ${
                      record.diagnosis
                    }</p>
                    <p style="margin: 0.25rem 0;"><strong>Doctor:</strong> ${
                      record.doctor_name
                    }</p>
                    <p style="margin: 0.25rem 0;"><strong>Date:</strong> ${new Date(
                      record.created_at
                    ).toLocaleDateString()}</p>
                    <p style="margin: 0.25rem 0;"><strong>Severity:</strong> <span style="color: ${this.getSeverityColor(
                      record.severity
                    )}">${record.severity}</span></p>
                </div>
                <div class="record-actions">
                    <button class="btn secondary" onclick="app.viewRecord('${
                      record.id
                    }')" style="padding: 0.5rem 1rem; border: 1px solid #e2e8f0; background: #f7fafc; border-radius: 8px; cursor: pointer;">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                </div>
            </div>
        `
      )
      .join("");
  }

  getSeverityColor(severity) {
    switch (severity) {
      case "Low":
        return "#48bb78";
      case "Medium":
        return "#ed8936";
      case "High":
        return "#f56565";
      case "Critical":
        return "#e53e3e";
      default:
        return "#718096";
    }
  }

  viewRecord(recordId) {
    this.showNotification("Record details view coming soon!", "info");
  }

  resetForms() {
    const forms = document.querySelectorAll("form");
    forms.forEach((form) => form.reset());

    const statusMessages = document.querySelectorAll(".status-message");
    statusMessages.forEach((msg) => (msg.textContent = ""));

    const detailSections = document.querySelectorAll(
      ".hospital-card, .patient-verified-card"
    );
    detailSections.forEach((section) => section.classList.add("hidden"));

    const passwordSection = document.getElementById("passwordSection");
    if (passwordSection) passwordSection.classList.add("hidden");

    const medicalDetailsCard = document.getElementById("medicalDetailsCard");
    if (medicalDetailsCard) medicalDetailsCard.style.display = "none";

    const filesList = document.getElementById("filesList");
    if (filesList) filesList.innerHTML = "";

    // Reset verify button
    const verifyBtn = document.getElementById("verifyPatientBtn");
    if (verifyBtn) {
      verifyBtn.innerHTML = '<i class="fas fa-search"></i> Verify Patient';
      verifyBtn.classList.remove("success");
      verifyBtn.disabled = false;
    }

    this.hospitalData = null;
    this.verifiedPatient = null;
  }

  // Check database availability before operations
  checkDatabaseAvailability() {
    if (!isSupabaseInitialized) {
      this.showNotification(
        "Database connection not available. Please refresh the page.",
        "error"
      );
      return false;
    }
    return true;
  }

  // Signup Methods
  async verifyHospital() {
    if (!this.checkDatabaseAvailability()) return;

    const hospitalId = document
      .getElementById("hospitalId")
      .value.trim()
      .toUpperCase();
    const statusDiv = document.getElementById("hospitalIdStatus");
    const verifyBtn = document.getElementById("verifyBtn");
    const hospitalDetailsDiv = document.getElementById("hospitalDetails");
    const passwordSection = document.getElementById("passwordSection");

    if (!hospitalId) {
      this.showStatus(statusDiv, "Please enter Hospital ID", "error");
      return;
    }

    verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    verifyBtn.disabled = true;

    try {
      const { data, error } = await supabase
        .from("hospitals")
        .select("*")
        .eq("hospital_id", hospitalId)
        .single();

      if (error || !data) {
        this.showStatus(
          statusDiv,
          "Hospital ID not found. Please check and try again.",
          "error"
        );
        return;
      }

      if (!data.is_verified) {
        this.showStatus(
          statusDiv,
          "Hospital is not verified. Please contact administration.",
          "error"
        );
        return;
      }

      this.hospitalData = data;
      this.showStatus(statusDiv, "Hospital verified successfully!", "success");
      this.displayHospitalDetails(data);
      hospitalDetailsDiv.classList.remove("hidden");
      passwordSection.classList.remove("hidden");
      passwordSection.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      console.error("Verification error:", error);
      this.showStatus(
        statusDiv,
        "Error verifying hospital. Please try again.",
        "error"
      );
    } finally {
      verifyBtn.innerHTML = '<i class="fas fa-search"></i> Verify';
      verifyBtn.disabled = false;
    }
  }

  displayHospitalDetails(hospital) {
    document.getElementById("hospitalName").textContent = hospital.name;
    document.getElementById(
      "hospitalLocation"
    ).textContent = `${hospital.city}, ${hospital.state}`;
    document.getElementById("hospitalType").textContent =
      hospital.hospital_type;
    document.getElementById("hospitalLicense").textContent =
      hospital.license_number;
  }

  checkPasswordStrength() {
    const password = document.getElementById("password").value;
    const strengthBar = document.getElementById("strengthBar");
    const strengthText = document.getElementById("strengthText");

    let strength = 0;
    let feedback = "";

    if (password.length >= 8) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;

    strengthBar.className = "strength-bar";
    switch (strength) {
      case 0:
      case 1:
        strengthBar.classList.add("weak");
        feedback = "Weak - Add more characters and variety";
        break;
      case 2:
        strengthBar.classList.add("fair");
        feedback = "Fair - Add uppercase, numbers, or symbols";
        break;
      case 3:
      case 4:
        strengthBar.classList.add("good");
        feedback = "Good - Consider adding more complexity";
        break;
      case 5:
        strengthBar.classList.add("strong");
        feedback = "Strong password";
        break;
    }

    strengthText.textContent = feedback;
    strengthText.className = `strength-text ${
      strength >= 3 ? "success" : "error"
    }`;
  }

  validatePasswordMatch() {
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const statusDiv = document.getElementById("confirmPasswordStatus");

    if (confirmPassword && password !== confirmPassword) {
      this.showStatus(statusDiv, "Passwords do not match", "error");
      return false;
    } else if (confirmPassword && password === confirmPassword) {
      this.showStatus(statusDiv, "Passwords match", "success");
      return true;
    }
    return true;
  }

  async handleSignup(e) {
    e.preventDefault();

    if (!this.checkDatabaseAvailability()) return;

    if (!this.hospitalData) {
      this.showNotification("Please verify hospital first", "error");
      return;
    }

    const formData = new FormData(e.target);
    const signupBtn = document.getElementById("signupBtn");

    if (!this.validateSignupForm(formData)) {
      return;
    }

    signupBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
    signupBtn.disabled = true;

    try {
      // Update hospital record with password
      const { error } = await supabase
        .from("hospitals")
        .update({
          password_hash: formData.get("password"), // In production, hash this!
          admin_email: formData.get("adminEmail"),
          updated_at: new Date().toISOString(),
        })
        .eq("hospital_id", this.hospitalData.hospital_id);

      if (error) throw error;

      this.showNotification(
        "Hospital account created successfully!",
        "success"
      );
      setTimeout(() => this.showLogin(), 1500);
    } catch (error) {
      console.error("Signup error:", error);
      this.showNotification(
        "Error creating account. Please try again.",
        "error"
      );
    } finally {
      signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
      signupBtn.disabled = false;
    }
  }

  validateSignupForm(formData) {
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");
    const adminEmail = formData.get("adminEmail");
    const termsAccepted = document.getElementById("termsAccepted").checked;

    if (password !== confirmPassword) {
      this.showNotification("Passwords do not match", "error");
      return false;
    }

    if (password.length < 8) {
      this.showNotification(
        "Password must be at least 8 characters long",
        "error"
      );
      return false;
    }

    if (!adminEmail) {
      this.showNotification("Administrator email is required", "error");
      return false;
    }

    if (!termsAccepted) {
      this.showNotification("Please accept the terms of service", "error");
      return false;
    }

    return true;
  }

  // Login Methods
  async handleLogin(e) {
    e.preventDefault();

    if (!this.checkDatabaseAvailability()) return;

    const formData = new FormData(e.target);
    const hospitalId = formData.get("hospitalId").trim().toUpperCase();
    const password = formData.get("password");
    const rememberMe = document.getElementById("rememberMe").checked;
    const loginBtn = document.getElementById("loginBtn");

    if (!hospitalId || !password) {
      this.showNotification("Please fill in all fields", "error");
      return;
    }

    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
    loginBtn.disabled = true;

    try {
      const { data, error } = await supabase
        .from("hospitals")
        .select("*")
        .eq("hospital_id", hospitalId)
        .eq("password_hash", password) // In production, use proper password hashing
        .single();

      if (error || !data) {
        throw new Error(
          "Invalid credentials. Please check your Hospital ID and password."
        );
      }

      if (!data.is_verified) {
        throw new Error(
          "Hospital account is not verified. Please contact administration."
        );
      }

      const sessionData = {
        hospitalId: hospitalId,
        hospitalName: data.name,
        hospitalType: data.hospital_type,
        loginTime: new Date().toISOString(),
        rememberMe: rememberMe,
      };

      if (rememberMe) {
        localStorage.setItem("hospitalSession", JSON.stringify(sessionData));
      } else {
        sessionStorage.setItem("hospitalSession", JSON.stringify(sessionData));
      }

      this.currentSession = sessionData;
      this.showNotification("Login successful!", "success");
      setTimeout(() => this.showDashboard(), 1000);
    } catch (error) {
      console.error("Login error:", error);
      this.showNotification(error.message, "error");
    } finally {
      loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
      loginBtn.disabled = false;
    }
  }

  handleForgotPassword(e) {
    e.preventDefault();
    const hospitalId = prompt("Enter your Hospital ID:");
    if (hospitalId) {
      this.showNotification(
        `Password reset instructions will be sent to the registered email for Hospital ID: ${hospitalId.toUpperCase()}`,
        "info"
      );
    }
  }

  // Dashboard Methods
  async loadDashboardStats() {
    if (!this.checkDatabaseAvailability()) return;

    try {
      const today = new Date().toISOString().split("T")[0];

      // Get today's records count
      const { count: todayCount, error: todayError } = await supabase
        .from("medical_records")
        .select("*", { count: "exact", head: true })
        .eq("hospital_id", this.currentSession.hospitalId)
        .gte("created_at", today);

      // Get total records count
      const { count: totalCount, error: totalError } = await supabase
        .from("medical_records")
        .select("*", { count: "exact", head: true })
        .eq("hospital_id", this.currentSession.hospitalId);

      if (!todayError) {
        document.getElementById("todaysRecords").textContent = todayCount || 0;
      }
      if (!totalError) {
        document.getElementById("totalRecords").textContent = totalCount || 0;
      }
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
    }
  }

  // Patient Verification Methods
  async verifyPatient() {
    if (!this.checkDatabaseAvailability()) return;

    const patientId = document
      .getElementById("patientId")
      .value.trim()
      .toUpperCase();
    const patientPhone = document.getElementById("patientPhone").value.trim();
    const patientName = document.getElementById("patientName").value.trim();
    const patientIdStatus = document.getElementById("patientIdStatus");
    const patientPhoneStatus = document.getElementById("patientPhoneStatus");
    const patientNameStatus = document.getElementById("patientNameStatus");
    const verifyBtn = document.getElementById("verifyPatientBtn");

    // Clear previous status messages
    this.showStatus(patientIdStatus, "", "");
    this.showStatus(patientPhoneStatus, "", "");
    this.showStatus(patientNameStatus, "", "");

    if (!patientId || !patientPhone || !patientName) {
      this.showNotification(
        "Please fill in Patient ID, Phone, and Name",
        "error"
      );
      return;
    }

    verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    verifyBtn.disabled = true;

    try {
      // Verify patient exists with matching ID
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("patient_id", patientId)
        .eq("is_active", true)
        .single();

      if (patientError || !patientData) {
        this.showStatus(
          patientIdStatus,
          "Patient ID not found in our records",
          "error"
        );
        return;
      }

      // Verify phone number matches
      if (patientData.phone !== patientPhone) {
        this.showStatus(
          patientPhoneStatus,
          "Phone number does not match our records",
          "error"
        );
        return;
      }

      // Verify name matches (case insensitive)
      if (patientData.name.toLowerCase() !== patientName.toLowerCase()) {
        this.showStatus(
          patientNameStatus,
          "Name does not match our records",
          "error"
        );
        return;
      }

      // All verification passed
      this.verifiedPatient = patientData;
      this.showStatus(
        patientIdStatus,
        "Patient verified successfully!",
        "success"
      );
      this.showStatus(patientPhoneStatus, "Phone verified!", "success");
      this.showStatus(patientNameStatus, "Name verified!", "success");
      this.displayVerifiedPatient(patientData);
      this.showMedicalDetailsForm();

      verifyBtn.innerHTML = '<i class="fas fa-check"></i> Verified';
      verifyBtn.classList.add("success");
    } catch (error) {
      console.error("Patient verification error:", error);
      this.showNotification(
        "Error verifying patient. Please try again.",
        "error"
      );
    } finally {
      verifyBtn.disabled = false;
    }
  }

  autoVerifyPatient() {
    const patientId = document.getElementById("patientId").value.trim();
    const patientPhone = document.getElementById("patientPhone").value.trim();
    const patientName = document.getElementById("patientName").value.trim();

    if (
      patientId.length >= 6 &&
      patientPhone.length >= 10 &&
      patientName.length >= 3
    ) {
      clearTimeout(this.autoSearchTimeout);
      this.autoSearchTimeout = setTimeout(() => {
        this.verifyPatient();
      }, 1500);
    }
  }

  displayVerifiedPatient(patient) {
    // Calculate age
    const age = patient.date_of_birth
      ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()
      : "N/A";

    document.getElementById("verifiedPatientName").textContent = patient.name;
    document.getElementById("verifiedPatientPhone").textContent = patient.phone;
    document.getElementById("verifiedPatientEmail").textContent =
      patient.email || "N/A";
    document.getElementById("verifiedPatientAge").textContent =
      age + (age !== "N/A" ? " years" : "");
    document.getElementById("verifiedPatientGender").textContent =
      patient.gender || "N/A";
    document.getElementById("verifiedPatientBloodGroup").textContent =
      patient.blood_group || "N/A";

    document.getElementById("patientDetailsCard").classList.remove("hidden");
  }

  showMedicalDetailsForm() {
    const medicalDetailsCard = document.getElementById("medicalDetailsCard");
    if (medicalDetailsCard) {
      medicalDetailsCard.style.display = "block";
      medicalDetailsCard.scrollIntoView({ behavior: "smooth" });
    }
  }

  async handleAddRecord(e) {
    e.preventDefault();

    if (!this.checkDatabaseAvailability()) return;

    if (!this.verifiedPatient) {
      this.showNotification("Please verify patient information first", "error");
      return;
    }

    if (!this.currentSession) {
      this.showNotification("Please log in first", "error");
      return;
    }

    const formData = new FormData(e.target);
    const submitBtn = document.getElementById("submitRecord");

    if (!this.validateRecordForm(formData)) {
      return;
    }

    submitBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Adding Record...';
    submitBtn.disabled = true;

    try {
      // Generate unique record number
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 5).toUpperCase();
      const recordNumber = `MED_${timestamp}_${random}`;

      // Process attachments
      const attachmentFiles = Array.from(
        document.getElementById("attachments").files
      );
      const attachmentNames = attachmentFiles.map((file) => file.name);

      // Calculate can_edit_until (1 hour from now)
      const canEditUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const recordData = {
        record_number: recordNumber,
        patient_id: this.verifiedPatient.patient_id,
        hospital_id: this.currentSession.hospitalId,
        record_type: formData.get("recordType"),
        doctor_name: formData.get("doctorName"),
        doctor_specialization: formData.get("doctorSpecialization") || null,
        diagnosis: formData.get("diagnosis"),
        treatment: formData.get("treatment") || null,
        medications: formData.get("medications") || null,
        follow_up_date: formData.get("followUpDate") || null,
        severity: formData.get("severity"),
        notes: formData.get("notes") || null,
        attachments: attachmentNames.length > 0 ? attachmentNames : null,
        can_edit_until: canEditUntil,
        is_editable: true,
      };

      console.log("Attempting to insert record:", recordData);

      const { data, error } = await supabase
        .from("medical_records")
        .insert([recordData])
        .select();

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      console.log("Record inserted successfully:", data);
      this.showNotification("Medical record added successfully!", "success");

      // Reset form and clear verification
      this.resetMedicalForm(e.target);
      await this.loadDashboardStats();

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Add record error details:", error);
      this.handleDatabaseError(error);
    } finally {
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Add Medical Record';
      submitBtn.disabled = false;
    }
  }

  handleDatabaseError(error) {
    let errorMessage = "Error adding record. Please try again.";

    if (error.message) {
      if (error.message.includes("duplicate key")) {
        errorMessage = "Record with this number already exists.";
      } else if (
        error.message.includes("foreign key") ||
        error.message.includes("violates foreign key constraint")
      ) {
        errorMessage =
          "Invalid patient or hospital reference. Please verify patient again.";
      } else if (
        error.message.includes("not null") ||
        error.message.includes("null value")
      ) {
        errorMessage = "Please fill in all required fields.";
      } else if (
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      } else if (error.message.includes("check constraint")) {
        errorMessage = "Invalid data format. Please check your inputs.";
      } else {
        errorMessage = `Database error: ${error.message}`;
      }
    }

    this.showNotification(errorMessage, "error");
  }

  validateRecordForm(formData) {
    const requiredFields = {
      recordType: "Record Type",
      severity: "Severity Level",
      doctorName: "Doctor Name",
      diagnosis: "Diagnosis",
    };

    for (const [field, label] of Object.entries(requiredFields)) {
      const value = formData.get(field);
      if (!value || !value.trim()) {
        this.showNotification(`Please fill in the ${label} field`, "error");
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }

    // Check if patient is verified
    if (!this.verifiedPatient) {
      this.showNotification("Please verify patient information first", "error");
      return false;
    }

    // Check if user is logged in
    if (!this.currentSession) {
      this.showNotification("Please log in first", "error");
      return false;
    }

    return true;
  }

  resetMedicalForm(form) {
    // Reset form
    form.reset();
    document.getElementById("filesList").innerHTML = "";
    document.getElementById("patientDetailsCard").classList.add("hidden");
    document.getElementById("medicalDetailsCard").style.display = "none";

    // Reset patient verification fields
    document.getElementById("patientId").value = "";
    document.getElementById("patientPhone").value = "";
    document.getElementById("patientName").value = "";

    // Clear status messages
    document.getElementById("patientIdStatus").textContent = "";
    document.getElementById("patientPhoneStatus").textContent = "";
    document.getElementById("patientNameStatus").textContent = "";

    // Reset verify button
    const verifyBtn = document.getElementById("verifyPatientBtn");
    verifyBtn.innerHTML = '<i class="fas fa-search"></i> Verify Patient';
    verifyBtn.classList.remove("success");
    verifyBtn.disabled = false;

    this.verifiedPatient = null;
  }

  handleFileSelection(e) {
    const files = Array.from(e.target.files);
    const filesList = document.getElementById("filesList");

    filesList.innerHTML = "";

    files.forEach((file, index) => {
      const fileItem = document.createElement("div");
      fileItem.className = "file-item";
      fileItem.innerHTML = `
                <div class="file-info">
                    <i class="fas fa-file"></i>
                    <span>${file.name}</span>
                    <span class="file-size">(${(
                      file.size /
                      1024 /
                      1024
                    ).toFixed(2)} MB)</span>
                </div>
                <button type="button" class="remove-file" onclick="this.parentElement.remove(); app.updateFileInput();">
                    <i class="fas fa-times"></i>
                </button>
            `;
      filesList.appendChild(fileItem);
    });
  }

  updateFileInput() {
    // Reset file input when files are removed
    const fileInput = document.getElementById("attachments");
    const filesList = document.getElementById("filesList");

    if (filesList.children.length === 0) {
      fileInput.value = "";
    }
  }

  // Utility Methods
  togglePasswordVisibility(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);

    if (input.type === "password") {
      input.type = "text";
      toggle.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
      input.type = "password";
      toggle.innerHTML = '<i class="fas fa-eye"></i>';
    }
  }

  showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message ${type}`;
  }

  showNotification(message, type) {
    // Remove existing notification
    const existingNotification = document.querySelector(".notification");
    if (existingNotification) {
      existingNotification.remove();
    }

    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${
                  type === "success"
                    ? "check-circle"
                    : type === "error"
                    ? "exclamation-circle"
                    : "info-circle"
                }"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 5000);
  }

  handleLogout() {
    localStorage.removeItem("hospitalSession");
    sessionStorage.removeItem("hospitalSession");
    this.currentSession = null;
    this.showNotification("Logged out successfully", "success");
    setTimeout(() => this.showLogin(), 1000);
  }
}
