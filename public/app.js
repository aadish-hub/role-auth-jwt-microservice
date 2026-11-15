const authView = document.querySelector("#auth-view");
const accountView = document.querySelector("#account-view");
const form = document.querySelector("#auth-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const errorMessage = document.querySelector("#form-error");
const submitButton = document.querySelector("#submit-button");
const submitLabel = document.querySelector("#submit-label");

let mode = "login";
let accessToken = null;

function showFormError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearFormError() {
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}

function setMode(nextMode) {
  mode = nextMode;
  const isLogin = mode === "login";
  document.querySelector("#login-tab").classList.toggle("is-active", isLogin);
  document.querySelector("#register-tab").classList.toggle("is-active", !isLogin);
  document.querySelector("#login-tab").setAttribute("aria-selected", String(isLogin));
  document.querySelector("#register-tab").setAttribute("aria-selected", String(!isLogin));
  document.querySelector("#form-title").innerHTML = isLogin
    ? "Good to have<br>you <span>back.</span>"
    : "A fresh start<br>looks <span>good.</span>";
  document.querySelector("#form-subtitle").textContent = isLogin
    ? "Enter your details to sign in to your account."
    : "Create your account and get set up in a moment.";
  document.querySelector("#password-hint").textContent = isLogin
    ? "Your account password"
    : "At least 12 characters";
  passwordInput.autocomplete = isLogin ? "current-password" : "new-password";
  submitLabel.textContent = isLogin ? "Sign in to your account" : "Create your account";
  clearFormError();
}

async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...options, headers });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The service returned an unexpected response. Please try again.");
  }
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

function showAccount(user) {
  authView.hidden = true;
  accountView.hidden = false;
  document.querySelector("#profile-email").textContent = user.email;
  document.querySelector("#profile-avatar").textContent = user.email.charAt(0).toUpperCase();
  const roleBadge = document.querySelector("#profile-role");
  roleBadge.textContent = user.role;
  roleBadge.classList.toggle("admin", user.role === "ADMIN");

  const isAdmin = user.role === "ADMIN";
  document.querySelector("#admin-title").textContent = isAdmin
    ? "Admin workspace"
    : "Elevated access";
  document.querySelector("#admin-description").textContent = isAdmin
    ? "Your admin role gives you access to protected workspace tools."
    : "Protected tools are reserved for administrators. Your account has standard access.";
  document.querySelector("#admin-button-label").textContent = isAdmin
    ? "Open admin workspace"
    : "Admin access required";
  document.querySelector("#admin-button").disabled = !isAdmin;
  document.querySelector("#admin-lock").innerHTML = isAdmin
    ? '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5a2.5 2.5 0 1 1 5 0v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
}

function showAccountMessage(message, isError = false) {
  const element = document.querySelector("#account-message");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.hidden = false;
}

document.querySelector("#login-tab").addEventListener("click", () => setMode("login"));
document.querySelector("#register-tab").addEventListener("click", () => setMode("register"));

document.querySelector("#toggle-password").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormError();
  if (!form.reportValidity()) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (mode === "register" && password.length < 12) {
    showFormError("Choose a password with at least 12 characters.");
    passwordInput.focus();
    return;
  }
  if (new TextEncoder().encode(password).length > 72) {
    showFormError("Your password must be no more than 72 UTF-8 bytes.");
    passwordInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitLabel.textContent = mode === "login" ? "Signing you in…" : "Creating your account…";
  try {
    const result = await apiRequest(mode === "login" ? "/auth/login" : "/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    accessToken = result.token;
    showAccount(result.user);
  } catch (error) {
    showFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = mode === "login" ? "Sign in to your account" : "Create your account";
  }
});

document.querySelector("#admin-button").addEventListener("click", async () => {
  if (!accessToken) return;
  const button = document.querySelector("#admin-button");
  button.disabled = true;
  try {
    const result = await apiRequest("/admin");
    showAccountMessage(result.message);
  } catch (error) {
    showAccountMessage(error instanceof Error ? error.message : "Unable to verify admin access.", true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#signout-button").addEventListener("click", () => {
  accessToken = null;
  passwordInput.value = "";
  document.querySelector("#account-message").hidden = true;
  accountView.hidden = true;
  authView.hidden = false;
  setMode("login");
  document.title = "Rolebase — Welcome back";
});

