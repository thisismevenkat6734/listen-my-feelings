// =========================================================
// LISTEN MY FEELINGS
// Main Application Script
// Production Authentication + UI Controller
// =========================================================

import {
    auth,
    db
} from "./firebase/firebase-config.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// =========================================================
// APPLICATION CONSTANTS
// =========================================================

const APP_PREFIX = "lmf_";

const STORAGE_KEYS = {
    privacyAccepted: `${APP_PREFIX}privacy_accepted`,
    draftFeeling: `${APP_PREFIX}draft_feeling`,
    lastSection: `${APP_PREFIX}last_section`
};

const MODAL_IDS = {
    login: "login-modal",
    signup: "signup-modal",
    forgotPassword: "forgot-password-modal"
};


// =========================================================
// DOM HELPERS
// =========================================================

const $ = (selector, parent = document) =>
    parent.querySelector(selector);

const $$ = (selector, parent = document) =>
    Array.from(parent.querySelectorAll(selector));


// =========================================================
// APPLICATION STATE
// =========================================================

const state = {
    currentUser: null,
    activeModal: null,
    lastFocusedElement: null,
    mobileMenuOpen: false,
    authLoading: false
};


// =========================================================
// LOCAL STORAGE HELPERS
// =========================================================

function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.warn("Local Storage read unavailable.");
        return null;
    }
}


function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn("Local Storage write unavailable.");
        return false;
    }
}


function storageRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.warn("Local Storage remove unavailable.");
    }
}


// =========================================================
// TEXT HELPERS
// =========================================================

function normalizeText(value) {
    return String(value || "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}


function normalizeEmail(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}


function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


// =========================================================
// TOAST
// =========================================================

function showToast(message, type = "default") {
    const toast = $("#global-toast");

    if (!toast) {
        return;
    }

    const messageElement =
        toast.querySelector("[data-toast-message]") ||
        toast;

    messageElement.textContent = message;

    toast.classList.remove(
        "toast-success",
        "toast-error",
        "toast-info",
        "show"
    );

    if (type === "success") {
        toast.classList.add("toast-success");
    }

    if (type === "error") {
        toast.classList.add("toast-error");
    }

    if (type === "info") {
        toast.classList.add("toast-info");
    }

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    window.clearTimeout(showToast.timeout);

    showToast.timeout = window.setTimeout(() => {
        toast.classList.remove("show");
    }, 4200);
}


// =========================================================
// FORM ERROR HELPERS
// =========================================================

function clearFormErrors(form) {
    if (!form) {
        return;
    }

    $$(".field-error", form).forEach((element) => {
        element.textContent = "";
        element.hidden = true;
    });

    $$(
        "input, textarea, select",
        form
    ).forEach((input) => {
        input.removeAttribute("aria-invalid");
    });
}


function setFieldError(form, fieldName, message) {
    if (!form) {
        return;
    }

    const input = form.querySelector(
        `[name="${fieldName}"]`
    );

    if (input) {
        input.setAttribute("aria-invalid", "true");
    }

    const error =
        form.querySelector(
            `[data-error-for="${fieldName}"]`
        );

    if (error) {
        error.textContent = message;
        error.hidden = false;
    }
}


function getInput(form, name) {
    const input = form?.querySelector(
        `[name="${name}"]`
    );

    return input ? input.value : "";
}


// =========================================================
// BUTTON LOADING STATE
// =========================================================

function setFormLoading(form, loading) {
    if (!form) {
        return;
    }

    const button = form.querySelector(
        'button[type="submit"]'
    );

    if (!button) {
        return;
    }

    const label =
        button.querySelector("[data-button-label]");

    const spinner =
        button.querySelector("[data-button-spinner]");

    button.disabled = loading;
    button.setAttribute(
        "aria-busy",
        loading ? "true" : "false"
    );

    if (label) {
        if (!button.dataset.originalLabel) {
            button.dataset.originalLabel =
                label.textContent;
        }

        label.textContent = loading
            ? "Please wait..."
            : button.dataset.originalLabel;
    }

    if (spinner) {
        spinner.hidden = !loading;
    }
}


// =========================================================
// MODAL MANAGEMENT
// =========================================================

function getModalFocusableElements(modal) {
    if (!modal) {
        return [];
    }

    return $$(
        [
            "button:not([disabled])",
            "a[href]",
            "input:not([disabled])",
            "textarea:not([disabled])",
            "select:not([disabled])",
            "[tabindex]:not([tabindex='-1'])"
        ].join(","),
        modal
    ).filter((element) => {
        return !element.hidden &&
            element.offsetParent !== null;
    });
}


function openModal(modalId) {
    const modal = document.getElementById(modalId);

    if (!modal) {
        return;
    }

    if (state.activeModal) {
        closeModal(state.activeModal, false);
    }

    state.lastFocusedElement =
        document.activeElement;

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");

    state.activeModal = modalId;

    document.body.classList.add("modal-open");

    const firstFocusable =
        getModalFocusableElements(modal)[0];

    window.setTimeout(() => {
        if (firstFocusable) {
            firstFocusable.focus();
        }
    }, 50);
}


function closeModal(modalId = state.activeModal, restoreFocus = true) {
    if (!modalId) {
        return;
    }

    const modal =
        document.getElementById(modalId);

    if (!modal) {
        return;
    }

    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");

    if (state.activeModal === modalId) {
        state.activeModal = null;
    }

    if (!state.activeModal) {
        document.body.classList.remove("modal-open");
    }

    if (
        restoreFocus &&
        state.lastFocusedElement &&
        typeof state.lastFocusedElement.focus === "function"
    ) {
        state.lastFocusedElement.focus();
        state.lastFocusedElement = null;
    }
}


function switchModal(fromId, toId) {
    closeModal(fromId, false);
    openModal(toId);
}


// =========================================================
// MOBILE NAVIGATION
// =========================================================

function setMobileMenu(open) {
    const menu =
        $("#mobile-menu");

    const toggle =
        $('[data-action="toggle-mobile-menu"]');

    if (!menu || !toggle) {
        return;
    }

    state.mobileMenuOpen = open;

    menu.hidden = !open;

    toggle.setAttribute(
        "aria-expanded",
        open ? "true" : "false"
    );

    document.body.classList.toggle(
        "mobile-menu-open",
        open
    );
}


function closeMobileMenu() {
    setMobileMenu(false);
}


// =========================================================
// NAVIGATION
// =========================================================

function scrollToSection(target) {
    if (!target) {
        return;
    }

    const element =
        document.querySelector(target);

    if (!element) {
        return;
    }

    closeMobileMenu();

    element.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    storageSet(
        STORAGE_KEYS.lastSection,
        target
    );
}


function scrollToHome() {
    closeMobileMenu();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    storageSet(
        STORAGE_KEYS.lastSection,
        "home"
    );
}


// =========================================================
// PRIVACY NOTICE
// =========================================================

function initializePrivacyNotice() {
    const notice =
        $("#privacy-notice");

    if (!notice) {
        return;
    }

    const accepted =
        storageGet(
            STORAGE_KEYS.privacyAccepted
        );

    if (accepted === "true") {
        notice.hidden = true;
        return;
    }

    window.setTimeout(() => {
        notice.hidden = false;
    }, 800);
}


function acceptPrivacyNotice() {
    storageSet(
        STORAGE_KEYS.privacyAccepted,
        "true"
    );

    const notice =
        $("#privacy-notice");

    if (notice) {
        notice.hidden = true;
    }
}


// =========================================================
// PASSWORD VISIBILITY
// =========================================================

function togglePasswordVisibility(button) {
    const targetId =
        button?.dataset.target;

    if (!targetId) {
        return;
    }

    const input =
        document.getElementById(targetId);

    if (!input) {
        return;
    }

    const showing =
        input.type === "text";

    input.type =
        showing ? "password" : "text";

    button.setAttribute(
        "aria-pressed",
        showing ? "false" : "true"
    );

    const label =
        button.querySelector(
            "[data-password-toggle-label]"
        );

    if (label) {
        label.textContent =
            showing ? "Show password" : "Hide password";
    }
}


// =========================================================
// FIREBASE ERROR MESSAGES
// =========================================================

function getAuthErrorMessage(error) {
    const code =
        error?.code || "";

    const messages = {
        "auth/invalid-email":
            "Please enter a valid email address.",

        "auth/missing-password":
            "Please enter your password.",

        "auth/weak-password":
            "Your password is too weak. Use at least 8 characters.",

        "auth/email-already-in-use":
            "An account with this email already exists. Try logging in instead.",

        "auth/user-disabled":
            "This account has been disabled. Please contact support.",

        "auth/invalid-credential":
            "The email or password is incorrect.",

        "auth/wrong-password":
            "The email or password is incorrect.",

        "auth/user-not-found":
            "The email or password is incorrect.",

        "auth/too-many-requests":
            "Too many attempts were made. Please wait a while and try again.",

        "auth/network-request-failed":
            "Network connection failed. Please check your internet connection.",

        "auth/operation-not-allowed":
            "Email/password authentication is not currently enabled.",

        "auth/app-not-authorized":
            "This website is not authorized in the Firebase project.",

        "auth/invalid-api-key":
            "Firebase configuration needs attention.",

        "auth/requires-recent-login":
            "Please log in again and retry this action.",

        "auth/popup-blocked":
            "Your browser blocked the authentication window.",

        "auth/internal-error":
            "Something went wrong. Please try again."
    };

    return (
        messages[code] ||
        "Something went wrong. Please try again."
    );
}


// =========================================================
// FIRESTORE USER PROFILE
// =========================================================

async function ensureUserProfile(
    user,
    preferredDisplayName = null
) {
    if (!user) {
        return;
    }

    const userRef =
        doc(db, "users", user.uid);

    try {
        const existing =
            await getDoc(userRef);

        const displayName =
            normalizeText(
                preferredDisplayName ||
                user.displayName ||
                "Listener"
            ).slice(0, 50);

        if (!existing.exists()) {
            await setDoc(
                userRef,
                {
                    uid: user.uid,
                    displayName:
                        displayName || "Listener",

                    role: "user",

                    status: "active",

                    emailVerified:
                        Boolean(user.emailVerified),

                    profileVersion: 1,

                    createdAt:
                        serverTimestamp(),

                    updatedAt:
                        serverTimestamp()
                }
            );

            return;
        }

        const updateData = {
            emailVerified:
                Boolean(user.emailVerified),

            updatedAt:
                serverTimestamp()
        };

        if (
            preferredDisplayName &&
            normalizeText(preferredDisplayName)
        ) {
            updateData.displayName =
                displayName;
        }

        await setDoc(
            userRef,
            updateData,
            {
                merge: true
            }
        );
    } catch (error) {
        /*
         * Do not expose Firestore implementation
         * details to the user.
         *
         * Authentication remains valid. The profile
         * can be retried during the next auth event.
         */
        console.error(
            "User profile synchronization failed:",
            error
        );
    }
}


// =========================================================
// LOGIN
// =========================================================

async function handleLogin(event) {
    event.preventDefault();

    const form =
        event.currentTarget;

    clearFormErrors(form);

    const email =
        normalizeEmail(
            getInput(form, "email")
        );

    const password =
        getInput(form, "password");

    let valid = true;

    if (!isValidEmail(email)) {
        setFieldError(
            form,
            "email",
            "Enter a valid email address."
        );

        valid = false;
    }

    if (!password) {
        setFieldError(
            form,
            "password",
            "Enter your password."
        );

        valid = false;
    }

    if (!valid) {
        return;
    }

    if (state.currentUser) {
        closeModal(MODAL_IDS.login);

        showToast(
            "You are already signed in.",
            "info"
        );

        return;
    }

    setFormLoading(form, true);

    state.authLoading = true;

    try {
        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        closeModal(
            MODAL_IDS.login
        );

        form.reset();

        showToast(
            "Welcome back. You are signed in successfully.",
            "success"
        );
    } catch (error) {
        console.error(
            "Login error:",
            error
        );

        setFieldError(
            form,
            "password",
            getAuthErrorMessage(error)
        );
    } finally {
        state.authLoading = false;

        setFormLoading(
            form,
            false
        );
    }
}


// =========================================================
// SIGN UP
// =========================================================

async function handleSignup(event) {
    event.preventDefault();

    const form =
        event.currentTarget;

    clearFormErrors(form);

    const displayName =
        normalizeText(
            getInput(form, "displayName")
        );

    const email =
        normalizeEmail(
            getInput(form, "email")
        );

    const password =
        getInput(form, "password");

    const confirmPassword =
        getInput(
            form,
            "confirmPassword"
        );

    const agreement =
        form.querySelector(
            'input[name="agreement"]'
        );

    let valid = true;

    if (
        displayName.length < 2 ||
        displayName.length > 50
    ) {
        setFieldError(
            form,
            "displayName",
            "Your display name must be between 2 and 50 characters."
        );

        valid = false;
    }

    if (!isValidEmail(email)) {
        setFieldError(
            form,
            "email",
            "Enter a valid email address."
        );

        valid = false;
    }

    if (password.length < 8) {
        setFieldError(
            form,
            "password",
            "Password must contain at least 8 characters."
        );

        valid = false;
    }

    if (password !== confirmPassword) {
        setFieldError(
            form,
            "confirmPassword",
            "Passwords do not match."
        );

        valid = false;
    }

    if (!agreement?.checked) {
        setFieldError(
            form,
            "agreement",
            "You must agree to the Terms and Privacy Policy."
        );

        valid = false;
    }

    if (!valid) {
        return;
    }

    if (state.currentUser) {
        closeModal(MODAL_IDS.signup);

        showToast(
            "You are already signed in.",
            "info"
        );

        return;
    }

    setFormLoading(form, true);

    state.authLoading = true;

    try {
        const credential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

        const user =
            credential.user;

        try {
            await updateProfile(
                user,
                {
                    displayName
                }
            );
        } catch (profileError) {
            console.warn(
                "Firebase Auth display name update failed:",
                profileError
            );
        }

        await ensureUserProfile(
            user,
            displayName
        );

        form.reset();

        closeModal(
            MODAL_IDS.signup
        );

        showToast(
            "Your account has been created successfully.",
            "success"
        );
    } catch (error) {
        console.error(
            "Signup error:",
            error
        );

        const message =
            getAuthErrorMessage(error);

        if (
            error?.code ===
            "auth/email-already-in-use"
        ) {
            setFieldError(
                form,
                "email",
                message
            );
        } else if (
            error?.code ===
            "auth/weak-password"
        ) {
            setFieldError(
                form,
                "password",
                message
            );
        } else {
            setFieldError(
                form,
                "email",
                message
            );
        }
    } finally {
        state.authLoading = false;

        setFormLoading(
            form,
            false
        );
    }
}


// =========================================================
// PASSWORD RESET
// =========================================================

async function handleForgotPassword(event) {
    event.preventDefault();

    const form =
        event.currentTarget;

    clearFormErrors(form);

    const email =
        normalizeEmail(
            getInput(form, "email")
        );

    if (!isValidEmail(email)) {
        setFieldError(
            form,
            "email",
            "Enter a valid email address."
        );

        return;
    }

    setFormLoading(
        form,
        true
    );

    try {
        await sendPasswordResetEmail(
            auth,
            email
        );

        form.reset();

        closeModal(
            MODAL_IDS.forgotPassword
        );

        /*
         * Deliberately generic wording prevents
         * account-email enumeration.
         */
        showToast(
            "If an account exists for that email, a password reset link has been sent.",
            "success"
        );
    } catch (error) {
        console.error(
            "Password reset error:",
            error
        );

        /*
         * Keep the user-facing response generic.
         */
        showToast(
            "If an account exists for that email, a password reset link will be sent.",
            "info"
        );
    } finally {
        setFormLoading(
            form,
            false
        );
    }
}


// =========================================================
// LOGOUT
// =========================================================

async function logoutUser() {
    try {
        await signOut(auth);

        showToast(
            "You have been signed out.",
            "success"
        );
    } catch (error) {
        console.error(
            "Logout error:",
            error
        );

        showToast(
            "Unable to sign out right now. Please try again.",
            "error"
        );
    }
}


// =========================================================
// AUTH STATE
// =========================================================

function initializeAuthState() {
    onAuthStateChanged(
        auth,
        async (user) => {
            state.currentUser =
                user || null;

            if (user) {
                await ensureUserProfile(
                    user
                );

                document.documentElement
                    .setAttribute(
                        "data-authenticated",
                        "true"
                    );
            } else {
                document.documentElement
                    .removeAttribute(
                        "data-authenticated"
                    );
            }

            updateAuthenticationUI(
                user
            );
        }
    );
}


// =========================================================
// AUTHENTICATION UI
// =========================================================

function updateAuthenticationUI(user) {
    const loginButtons =
        $$('[data-action="open-login"]');

    const signupButtons =
        $$('[data-action="open-signup"]');

    const accountButtons =
        $$('[data-authenticated-only]');

    loginButtons.forEach((button) => {
        if (user) {
            button.setAttribute(
                "aria-label",
                "You are already signed in"
            );
        } else {
            button.removeAttribute(
                "aria-label"
            );
        }
    });

    signupButtons.forEach((button) => {
        if (user) {
            button.setAttribute(
                "aria-label",
                "You already have an account"
            );
        } else {
            button.removeAttribute(
                "aria-label"
            );
        }
    });

    accountButtons.forEach((element) => {
        element.hidden = !user;
    });
}


// =========================================================
// GLOBAL CLICK HANDLER
// =========================================================

function initializeClickActions() {
    document.addEventListener(
        "click",
        (event) => {
            const actionElement =
                event.target.closest(
                    "[data-action]"
                );

            if (!actionElement) {
                return;
            }

            const action =
                actionElement.dataset.action;

            switch (action) {
                case "open-login":
                    event.preventDefault();

                    if (state.currentUser) {
                        showToast(
                            "You are already signed in.",
                            "info"
                        );
                        return;
                    }

                    openModal(
                        MODAL_IDS.login
                    );
                    break;


                case "open-signup":
                    event.preventDefault();

                    if (state.currentUser) {
                        showToast(
                            "You already have an account and are signed in.",
                            "info"
                        );
                        return;
                    }

                    openModal(
                        MODAL_IDS.signup
                    );
                    break;


                case "open-forgot-password":
                    event.preventDefault();

                    switchModal(
                        MODAL_IDS.login,
                        MODAL_IDS.forgotPassword
                    );
                    break;


                case "switch-to-login":
                    event.preventDefault();

                    switchModal(
                        MODAL_IDS.signup,
                        MODAL_IDS.login
                    );
                    break;


                case "switch-to-signup":
                    event.preventDefault();

                    switchModal(
                        MODAL_IDS.login,
                        MODAL_IDS.signup
                    );
                    break;


                case "switch-forgot-to-login":
                    event.preventDefault();

                    switchModal(
                        MODAL_IDS.forgotPassword,
                        MODAL_IDS.login
                    );
                    break;


                case "close-modal":
                    event.preventDefault();

                    closeModal(
                        actionElement.closest(".modal")?.id
                    );
                    break;


                case "toggle-mobile-menu":
                    event.preventDefault();

                    setMobileMenu(
                        !state.mobileMenuOpen
                    );
                    break;


                case "navigate-home":
                    event.preventDefault();

                    scrollToHome();
                    break;


                case "navigate-section":
                    event.preventDefault();

                    scrollToSection(
                        actionElement.getAttribute("href")
                    );
                    break;


                case "accept-privacy":
                    event.preventDefault();

                    acceptPrivacyNotice();
                    break;


                case "toggle-password":
                    event.preventDefault();

                    togglePasswordVisibility(
                        actionElement
                    );
                    break;


                case "logout":
                    event.preventDefault();

                    logoutUser();
                    break;


                default:
                    break;
            }
        }
    );
}


// =========================================================
// MODAL BACKDROP + KEYBOARD ACCESSIBILITY
// =========================================================

function initializeModalAccessibility() {
    document.addEventListener(
        "click",
        (event) => {
            const modal =
                event.target.closest(".modal");

            if (!modal) {
                return;
            }

            if (
                event.target === modal ||
                event.target.hasAttribute(
                    "data-modal-backdrop"
                )
            ) {
                closeModal(
                    modal.id
                );
            }
        }
    );


    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape") {
                if (state.activeModal) {
                    closeModal(
                        state.activeModal
                    );

                    return;
                }

                if (state.mobileMenuOpen) {
                    closeMobileMenu();
                }

                return;
            }


            if (
                event.key !== "Tab" ||
                !state.activeModal
            ) {
                return;
            }

            const modal =
                document.getElementById(
                    state.activeModal
                );

            if (!modal) {
                return;
            }

            const focusable =
                getModalFocusableElements(
                    modal
                );

            if (!focusable.length) {
                return;
            }

            const first =
                focusable[0];

            const last =
                focusable[
                    focusable.length - 1
                ];

            if (
                event.shiftKey &&
                document.activeElement === first
            ) {
                event.preventDefault();
                last.focus();

                return;
            }

            if (
                !event.shiftKey &&
                document.activeElement === last
            ) {
                event.preventDefault();
                first.focus();
            }
        }
    );
}


// =========================================================
// FORM INITIALIZATION
// =========================================================

function initializeForms() {
    const loginForm =
        $("#login-form");

    const signupForm =
        $("#signup-form");

    const forgotPasswordForm =
        $("#forgot-password-form");


    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            handleLogin
        );
    }


    if (signupForm) {
        signupForm.addEventListener(
            "submit",
            handleSignup
        );
    }


    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener(
            "submit",
            handleForgotPassword
        );
    }


    $$("form").forEach((form) => {
        $$(
            "input, textarea, select",
            form
        ).forEach((input) => {
            input.addEventListener(
                "input",
                () => {
                    input.removeAttribute(
                        "aria-invalid"
                    );

                    const error =
                        form.querySelector(
                            `[data-error-for="${input.name}"]`
                        );

                    if (error) {
                        error.textContent = "";
                        error.hidden = true;
                    }
                }
            );
        });
    });
}


// =========================================================
// DRAFT STORAGE HELPERS
// =========================================================
// These helpers are intentionally local-only.
// Never store passwords, authentication tokens,
// private chat messages, or sensitive credentials here.

function saveFeelingDraft(text) {
    const normalized =
        normalizeText(text);

    if (!normalized) {
        storageRemove(
            STORAGE_KEYS.draftFeeling
        );

        return;
    }

    storageSet(
        STORAGE_KEYS.draftFeeling,
        normalized.slice(0, 5000)
    );
}


function getFeelingDraft() {
    return (
        storageGet(
            STORAGE_KEYS.draftFeeling
        ) || ""
    );
}


function clearFeelingDraft() {
    storageRemove(
        STORAGE_KEYS.draftFeeling
    );
}


// =========================================================
// CURRENT YEAR
// =========================================================

function initializeCurrentYear() {
    const currentYear =
        String(
            new Date().getFullYear()
        );

    $$("[data-current-year]").forEach(
        (element) => {
            element.textContent =
                currentYear;
        }
    );
}


// =========================================================
// VISUAL PAGE INITIALIZATION
// =========================================================

function initializePageVisibility() {
    document.documentElement
        .classList.add(
            "js-enabled"
        );
}


// =========================================================
// UNEXPECTED ERROR HANDLING
// =========================================================

function initializeGlobalErrorHandling() {
    window.addEventListener(
        "error",
        (event) => {
            console.error(
                "Unhandled application error:",
                event.error || event.message
            );
        }
    );


    window.addEventListener(
        "unhandledrejection",
        (event) => {
            console.error(
                "Unhandled promise rejection:",
                event.reason
            );
        }
    );
}


// =========================================================
// APPLICATION STARTUP
// =========================================================

function initializeApplication() {
    initializePageVisibility();

    initializeCurrentYear();

    initializePrivacyNotice();

    initializeClickActions();

    initializeModalAccessibility();

    initializeForms();

    initializeAuthState();

    initializeGlobalErrorHandling();
}


// =========================================================
// START
// =========================================================

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeApplication,
        {
            once: true
        }
    );
} else {
    initializeApplication();
}


// =========================================================
// PUBLIC LOCAL DRAFT API
// =========================================================
// Future feelings/post composer can use these
// without exposing authentication credentials.

window.ListenMyFeelings = {
    saveFeelingDraft,
    getFeelingDraft,
    clearFeelingDraft
};
