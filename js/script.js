/*
 * Listen My Feelings
 * Main landing-page controller + Firebase Authentication
 * Production foundation for V1
 *
 * File:
 * /js/script.js
 *
 * Important:
 * Firebase config is one folder above this file:
 * ../firebase/firebase-config.js
 */

import {
    auth,
    db
} from "../firebase/firebase-config.js";

import {
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   APP CONSTANTS
========================================================= */

const APP_NAME = "Listen My Feelings";
const APP_VERSION = "1.0.0";

const STORAGE_KEYS = {
    privacyAccepted: "lmf_privacy_accepted",
    feelingDraft: "lmf_feeling_draft",
    uiState: "lmf_ui_state"
};


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (selector, parent = document) => {
    return parent.querySelector(selector);
};

const $$ = (selector, parent = document) => {
    return Array.from(parent.querySelectorAll(selector));
};


/* =========================================================
   SAFE LOCAL STORAGE
========================================================= */

function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.warn("Local Storage read failed:", error);
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn("Local Storage write failed:", error);
        return false;
    }
}

function storageRemove(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.warn("Local Storage remove failed:", error);
        return false;
    }
}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function showToast(message, type = "info") {
    const toast = $("#global-toast");

    if (!toast) {
        console.log(`[${type}] ${message}`);
        return;
    }

    const messageElement = $("[data-toast-message]", toast);

    if (messageElement) {
        messageElement.textContent = message;
    } else {
        toast.textContent = message;
    }

    toast.classList.remove(
        "is-visible",
        "toast-success",
        "toast-error",
        "toast-info"
    );

    toast.classList.add("toast-" + type);

    requestAnimationFrame(() => {
        toast.classList.add("is-visible");
    });

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 3500);
}


/* =========================================================
   PAGE LOADER
========================================================= */

function hidePageLoader() {
    const loader = $(".page-loader");

    if (!loader) {
        return;
    }

    loader.classList.add("is-hidden");

    setTimeout(() => {
        loader.setAttribute("aria-hidden", "true");
    }, 500);
}


/* =========================================================
   CURRENT YEAR
========================================================= */

function updateCurrentYear() {
    const year = new Date().getFullYear();

    $$("[data-current-year]").forEach((element) => {
        element.textContent = year;
    });
}


/* =========================================================
   MODAL SYSTEM
========================================================= */

let activeModal = null;
let previousFocusedElement = null;

function getModalElement(modalId) {
    if (!modalId) {
        return null;
    }

    return document.getElementById(modalId);
}

function openModal(modalId) {
    const modal = getModalElement(modalId);

    if (!modal) {
        console.warn(`Modal not found: ${modalId}`);
        return;
    }

    if (activeModal && activeModal !== modal) {
        closeModal(activeModal);
    }

    previousFocusedElement = document.activeElement;
    activeModal = modal;

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add("modal-open");

    const firstFocusable = $(
        "input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]",
        modal
    );

    if (firstFocusable) {
        setTimeout(() => {
            firstFocusable.focus();
        }, 50);
    }
}

function closeModal(modalOrId = activeModal) {
    const modal =
        typeof modalOrId === "string"
            ? getModalElement(modalOrId)
            : modalOrId;

    if (!modal) {
        return;
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");

    if (activeModal === modal) {
        activeModal = null;
    }

    if (!activeModal) {
        document.body.classList.remove("modal-open");
    }

    if (
        previousFocusedElement &&
        typeof previousFocusedElement.focus === "function"
    ) {
        try {
            previousFocusedElement.focus();
        } catch {
            // Ignore focus restoration errors.
        }
    }

    previousFocusedElement = null;
}

function closeAllModals() {
    $$(".modal.is-open").forEach((modal) => {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
    });

    activeModal = null;
    document.body.classList.remove("modal-open");
}


/* =========================================================
   MODAL SWITCHING
========================================================= */

function showLoginModal() {
    closeAllModals();
    clearFormErrors($("#login-form"));
    openModal("login-modal");
}

function showSignupModal() {
    closeAllModals();
    clearFormErrors($("#signup-form"));
    openModal("signup-modal");
}

function showForgotPasswordModal() {
    closeAllModals();
    clearFormErrors($("#forgot-password-form"));
    openModal("forgot-password-modal");
}


/* =========================================================
   MOBILE MENU
========================================================= */

function closeMobileMenu() {
    const mobileMenu = $("#mobile-menu");
    const toggle = $('[data-action="toggle-mobile-menu"]');

    if (!mobileMenu) {
        return;
    }

    mobileMenu.classList.remove("is-open");
    mobileMenu.setAttribute("aria-hidden", "true");

    if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
    }

    document.body.classList.remove("mobile-menu-open");
}

function toggleMobileMenu() {
    const mobileMenu = $("#mobile-menu");
    const toggle = $('[data-action="toggle-mobile-menu"]');

    if (!mobileMenu) {
        return;
    }

    const isOpen = mobileMenu.classList.contains("is-open");

    if (isOpen) {
        closeMobileMenu();
        return;
    }

    mobileMenu.classList.add("is-open");
    mobileMenu.setAttribute("aria-hidden", "false");

    if (toggle) {
        toggle.setAttribute("aria-expanded", "true");
    }

    document.body.classList.add("mobile-menu-open");
}


/* =========================================================
   NAVIGATION
========================================================= */

function navigateToSection(sectionId) {
    if (!sectionId) {
        return;
    }

    const target = document.getElementById(sectionId);

    if (!target) {
        console.warn(`Section not found: ${sectionId}`);
        return;
    }

    closeMobileMenu();

    target.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function navigateHome() {
    closeMobileMenu();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================================================
   PRIVACY NOTICE
========================================================= */

function initPrivacyNotice() {
    const notice = $("#privacy-notice");

    if (!notice) {
        return;
    }

    const accepted = storageGet(STORAGE_KEYS.privacyAccepted);

    if (accepted === "true") {
        notice.classList.add("is-hidden");
    } else {
        notice.classList.remove("is-hidden");
    }
}

function acceptPrivacyNotice() {
    storageSet(STORAGE_KEYS.privacyAccepted, "true");

    const notice = $("#privacy-notice");

    if (notice) {
        notice.classList.add("is-hidden");
    }

    showToast("Privacy preference saved.", "success");
}


/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

function togglePasswordVisibility(button) {
    if (!button) {
        return;
    }

    const targetId = button.getAttribute("data-password-target");

    if (!targetId) {
        return;
    }

    const input = document.getElementById(targetId);

    if (!input) {
        return;
    }

    const showing = input.type === "text";

    input.type = showing ? "password" : "text";

    const label =
        button.getAttribute("data-password-toggle-label") ||
        "Show password";

    button.setAttribute(
        "aria-label",
        showing ? "Show password" : "Hide password"
    );

    button.setAttribute(
        "title",
        showing ? "Show password" : "Hide password"
    );

    if (button.dataset.originalLabel === undefined) {
        button.dataset.originalLabel = label;
    }
}


/* =========================================================
   FORM ERROR SYSTEM
========================================================= */

function clearFormErrors(form) {
    if (!form) {
        return;
    }

    $$("[data-error-for]", form).forEach((element) => {
        element.textContent = "";
        element.classList.remove("is-visible");
    });

    $$("input, textarea, select", form).forEach((input) => {
        input.removeAttribute("aria-invalid");
        input.classList.remove("input-error");
    });
}

function setFieldError(form, fieldName, message) {
    if (!form || !fieldName) {
        return;
    }

    const errorElement = $(
        `[data-error-for="${fieldName}"]`,
        form
    );

    const input = $(`[name="${fieldName}"]`, form);

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add("is-visible");
    }

    if (input) {
        input.setAttribute("aria-invalid", "true");
        input.classList.add("input-error");
    }
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    return typeof password === "string" && password.length >= 8;
}


/* =========================================================
   FORM LOADING STATE
========================================================= */

function setFormLoading(form, loading) {
    if (!form) {
        return;
    }

    const submitButton = $('button[type="submit"]', form);

    if (!submitButton) {
        return;
    }

    if (loading) {
        if (!submitButton.dataset.originalLabel) {
            submitButton.dataset.originalLabel =
                submitButton.textContent.trim();
        }

        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");

        const spinner = $("[data-button-spinner]", submitButton);

        if (spinner) {
            spinner.hidden = false;
        }

        const label = $("[data-button-label]", submitButton);

        if (label) {
            label.textContent = "Please wait...";
        } else {
            submitButton.textContent = "Please wait...";
        }
    } else {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");

        const spinner = $("[data-button-spinner]", submitButton);

        if (spinner) {
            spinner.hidden = true;
        }

        const label = $("[data-button-label]", submitButton);

        if (label) {
            label.textContent =
                submitButton.dataset.originalLabel || label.textContent;
        } else if (submitButton.dataset.originalLabel) {
            submitButton.textContent =
                submitButton.dataset.originalLabel;
        }
    }
}


/* =========================================================
   FIREBASE ERROR MESSAGES
========================================================= */

function getAuthErrorMessage(error) {
    const code = error?.code || "";

    const messages = {
        "auth/invalid-email":
            "Please enter a valid email address.",

        "auth/user-disabled":
            "This account has been disabled. Please contact support.",

        "auth/user-not-found":
            "No account was found with this email.",

        "auth/wrong-password":
            "The email or password is incorrect.",

        "auth/invalid-credential":
            "The email or password is incorrect.",

        "auth/email-already-in-use":
            "An account already exists with this email.",

        "auth/weak-password":
            "Please choose a stronger password.",

        "auth/password-does-not-meet-requirements":
            "Your password does not meet the required security rules.",

        "auth/too-many-requests":
            "Too many attempts. Please wait a while and try again.",

        "auth/network-request-failed":
            "Network error. Please check your internet connection.",

        "auth/operation-not-allowed":
            "This sign-in method is not currently enabled.",

        "auth/requires-recent-login":
            "Please sign in again and retry.",

        "auth/missing-email":
            "Please enter your email address."
    };

    return (
        messages[code] ||
        "Something went wrong. Please try again."
    );
}


/* =========================================================
   FIRESTORE USER PROFILE
========================================================= */

async function ensureUserProfile(user, extraData = {}) {
    if (!user) {
        return null;
    }

    const userRef = doc(db, "users", user.uid);

    try {
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
            const profile = {
                uid: user.uid,
                email: user.email || "",
                displayName:
                    extraData.displayName ||
                    user.displayName ||
                    "Listener",
                photoURL: user.photoURL || "",
                role: "user",
                status: "active",
                profileVersion: 1,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            await setDoc(userRef, profile);

            return profile;
        }

        await setDoc(
            userRef,
            {
                email: user.email || "",
                displayName:
                    user.displayName ||
                    snapshot.data()?.displayName ||
                    "Listener",
                photoURL: user.photoURL || "",
                updatedAt: serverTimestamp()
            },
            {
                merge: true
            }
        );

        return snapshot.data();
    } catch (error) {
        console.error("Firestore profile error:", error);

        /*
         * Authentication itself should still work even if profile
         * synchronization temporarily fails.
         */
        showToast(
            "Signed in, but your profile could not sync yet.",
            "info"
        );

        return null;
    }
}


/* =========================================================
   SIGN UP
========================================================= */

async function handleSignup(event) {
    event.preventDefault();

    const form = event.currentTarget;

    clearFormErrors(form);

    const displayName =
        ($('[name="displayName"]', form)?.value || "").trim();

    const email =
        ($('[name="email"]', form)?.value || "").trim();

    const password =
        $('[name="password"]', form)?.value || "";

    const confirmPassword =
        $('[name="confirmPassword"]', form)?.value || "";

    const agreement =
        $('[name="agreement"]', form)?.checked || false;

    let valid = true;

    if (displayName.length < 2) {
        setFieldError(
            form,
            "displayName",
            "Please enter at least 2 characters."
        );
        valid = false;
    }

    if (displayName.length > 60) {
        setFieldError(
            form,
            "displayName",
            "Display name must be 60 characters or less."
        );
        valid = false;
    }

    if (!validateEmail(email)) {
        setFieldError(
            form,
            "email",
            "Please enter a valid email address."
        );
        valid = false;
    }

    if (!validatePassword(password)) {
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

    if (!agreement) {
        setFieldError(
            form,
            "agreement",
            "Please accept the Terms and Privacy Policy."
        );
        valid = false;
    }

    if (!valid) {
        return;
    }

    setFormLoading(form, true);

    try {
        const credential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

        const user = credential.user;

        try {
            await updateProfile(user, {
                displayName
            });
        } catch (profileError) {
            console.warn(
                "Firebase display name update failed:",
                profileError
            );
        }

        await ensureUserProfile(user, {
            displayName
        });

        storageSet(
            STORAGE_KEYS.uiState,
            JSON.stringify({
                lastAuthAction: "signup",
                updatedAt: Date.now()
            })
        );

        closeAllModals();

        showToast(
            "Your account has been created successfully.",
            "success"
        );
    } catch (error) {
        console.error("Signup error:", error);

        const message = getAuthErrorMessage(error);

        if (error?.code === "auth/email-already-in-use") {
            setFieldError(form, "email", message);
        } else {
            showToast(message, "error");
        }
    } finally {
        setFormLoading(form, false);
    }
}


/* =========================================================
   LOGIN
========================================================= */

async function handleLogin(event) {
    event.preventDefault();

    const form = event.currentTarget;

    clearFormErrors(form);

    const email =
        ($('[name="email"]', form)?.value || "").trim();

    const password =
        $('[name="password"]', form)?.value || "";

    let valid = true;

    if (!validateEmail(email)) {
        setFieldError(
            form,
            "email",
            "Please enter a valid email address."
        );
        valid = false;
    }

    if (!password) {
        setFieldError(
            form,
            "password",
            "Please enter your password."
        );
        valid = false;
    }

    if (!valid) {
        return;
    }

    setFormLoading(form, true);

    try {
        const credential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

        await ensureUserProfile(credential.user);

        storageSet(
            STORAGE_KEYS.uiState,
            JSON.stringify({
                lastAuthAction: "login",
                updatedAt: Date.now()
            })
        );

        closeAllModals();

        showToast(
            "Welcome back. You are signed in.",
            "success"
        );
    } catch (error) {
        console.error("Login error:", error);

        const message = getAuthErrorMessage(error);

        if (
            error?.code === "auth/user-not-found" ||
            error?.code === "auth/wrong-password" ||
            error?.code === "auth/invalid-credential"
        ) {
            setFieldError(form, "email", message);
            setFieldError(form, "password", message);
        } else {
            showToast(message, "error");
        }
    } finally {
        setFormLoading(form, false);
    }
}


/* =========================================================
   PASSWORD RESET
========================================================= */

async function handleForgotPassword(event) {
    event.preventDefault();

    const form = event.currentTarget;

    clearFormErrors(form);

    const email =
        ($('[name="email"]', form)?.value || "").trim();

    if (!validateEmail(email)) {
        setFieldError(
            form,
            "email",
            "Please enter a valid email address."
        );
        return;
    }

    setFormLoading(form, true);

    try {
        await sendPasswordResetEmail(auth, email);

        form.reset();

        closeAllModals();

        showToast(
            "If an account exists for that email, a reset link has been sent.",
            "success"
        );
    } catch (error) {
        console.error("Password reset error:", error);

        showToast(
            getAuthErrorMessage(error),
            "error"
        );
    } finally {
        setFormLoading(form, false);
    }
}


/* =========================================================
   LOGOUT
========================================================= */

async function handleLogout() {
    try {
        await signOut(auth);

        showToast(
            "You have been signed out.",
            "success"
        );
    } catch (error) {
        console.error("Logout error:", error);

        showToast(
            "Unable to sign out right now.",
            "error"
        );
    }
}


/* =========================================================
   AUTH UI
========================================================= */

function updateAuthenticatedUI(user) {
    $$("[data-authenticated-only]").forEach((element) => {
        if (user) {
            element.removeAttribute("hidden");
            element.classList.remove("is-hidden");
        } else {
            element.setAttribute("hidden", "");
            element.classList.add("is-hidden");
        }
    });

    $$("[data-guest-only]").forEach((element) => {
        if (user) {
            element.setAttribute("hidden", "");
            element.classList.add("is-hidden");
        } else {
            element.removeAttribute("hidden");
            element.classList.remove("is-hidden");
        }
    });

    $$("[data-user-name]").forEach((element) => {
        element.textContent =
            user?.displayName ||
            user?.email?.split("@")[0] ||
            "Listener";
    });

    $$("[data-user-email]").forEach((element) => {
        element.textContent = user?.email || "";
    });
}


/* =========================================================
   DRAFT SYSTEM
========================================================= */

function saveFeelingDraft(draft) {
    if (
        draft === null ||
        draft === undefined ||
        draft === ""
    ) {
        storageRemove(STORAGE_KEYS.feelingDraft);
        return;
    }

    const payload = {
        text:
            typeof draft === "string"
                ? draft
                : draft.text || "",
        mood: typeof draft === "object"
            ? draft.mood || ""
            : "",
        topic: typeof draft === "object"
            ? draft.topic || ""
            : "",
        savedAt: Date.now()
    };

    storageSet(
        STORAGE_KEYS.feelingDraft,
        JSON.stringify(payload)
    );
}

function getFeelingDraft() {
    const raw = storageGet(STORAGE_KEYS.feelingDraft);

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        storageRemove(STORAGE_KEYS.feelingDraft);
        return null;
    }
}

function clearFeelingDraft() {
    storageRemove(STORAGE_KEYS.feelingDraft);
}


/* =========================================================
   ACTION HANDLER
========================================================= */

async function handleAction(actionElement) {
    const action = actionElement?.dataset?.action;

    if (!action) {
        return;
    }

    switch (action) {
        case "open-login":
            showLoginModal();
            break;

        case "open-signup":
            showSignupModal();
            break;

        case "open-forgot-password":
            showForgotPasswordModal();
            break;

        case "switch-to-login":
            showLoginModal();
            break;

        case "switch-to-signup":
            showSignupModal();
            break;

        case "switch-forgot-to-login":
            showLoginModal();
            break;

        case "close-modal":
            closeModal(
                actionElement.closest(".modal")
            );
            break;

        case "toggle-mobile-menu":
            toggleMobileMenu();
            break;

        case "navigate-home":
            navigateHome();
            break;

        case "navigate-section":
            navigateToSection(
                actionElement.dataset.section
            );
            break;

        case "accept-privacy":
            acceptPrivacyNotice();
            break;

        case "toggle-password":
            togglePasswordVisibility(actionElement);
            break;

        case "logout":
            await handleLogout();
            break;

        default:
            console.warn(
                `Unknown action: ${action}`
            );
    }
}


/* =========================================================
   GLOBAL CLICK HANDLER
========================================================= */

function initClickHandling() {
    document.addEventListener("click", async (event) => {
        const actionElement =
            event.target.closest("[data-action]");

        if (actionElement) {
            event.preventDefault();

            try {
                await handleAction(actionElement);
            } catch (error) {
                console.error(
                    "Action handling error:",
                    error
                );
            }

            return;
        }

        /*
         * Clicking directly on modal backdrop closes it.
         */
        const modal = event.target.closest(".modal");

        if (
            modal &&
            event.target === modal
        ) {
            closeModal(modal);
        }
    });
}


/* =========================================================
   KEYBOARD ACCESSIBILITY
========================================================= */

function initKeyboardHandling() {
    document.addEventListener("keydown", (event) => {
        /*
         * Escape closes modal/menu.
         */
        if (event.key === "Escape") {
            if (activeModal) {
                closeModal(activeModal);
                return;
            }

            closeMobileMenu();
        }

        /*
         * Basic modal focus trap.
         */
        if (
            event.key === "Tab" &&
            activeModal
        ) {
            const focusable = $$(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
                activeModal
            ).filter(
                (element) =>
                    element.offsetParent !== null
            );

            if (!focusable.length) {
                return;
            }

            const first = focusable[0];
            const last =
                focusable[focusable.length - 1];

            if (
                event.shiftKey &&
                document.activeElement === first
            ) {
                event.preventDefault();
                last.focus();
            } else if (
                !event.shiftKey &&
                document.activeElement === last
            ) {
                event.preventDefault();
                first.focus();
            }
        }
    });
}


/* =========================================================
   FORM INITIALIZATION
========================================================= */

function initForms() {
    const loginForm = $("#login-form");
    const signupForm = $("#signup-form");
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
}


/* =========================================================
   LIVE FORM CLEANUP
========================================================= */

function initInputValidation() {
    document.addEventListener("input", (event) => {
        const input = event.target;

        if (!(input instanceof HTMLInputElement)) {
            return;
        }

        if (
            input.hasAttribute("aria-invalid") ||
            input.classList.contains("input-error")
        ) {
            input.removeAttribute("aria-invalid");
            input.classList.remove("input-error");

            const form = input.closest("form");

            if (!form) {
                return;
            }

            const errorElement = $(
                `[data-error-for="${input.name}"]`,
                form
            );

            if (errorElement) {
                errorElement.textContent = "";
                errorElement.classList.remove(
                    "is-visible"
                );
            }
        }
    });
}


/* =========================================================
   AUTH STATE LISTENER
========================================================= */

function initAuthState() {
    onAuthStateChanged(auth, async (user) => {
        updateAuthenticatedUI(user);

        if (!user) {
            return;
        }

        /*
         * Synchronize the authenticated user's profile.
         */
        await ensureUserProfile(user);
    });
}


/* =========================================================
   SMOOTH HEADER STATE
========================================================= */

function initHeaderScrollState() {
    const header = $("#site-header");

    if (!header) {
        return;
    }

    const updateHeader = () => {
        if (window.scrollY > 20) {
            header.classList.add("is-scrolled");
        } else {
            header.classList.remove("is-scrolled");
        }
    };

    updateHeader();

    window.addEventListener(
        "scroll",
        updateHeader,
        {
            passive: true
        }
    );
}


/* =========================================================
   RESPONSIVE MENU CLEANUP
========================================================= */

function initResponsiveCleanup() {
    window.addEventListener("resize", () => {
        if (window.innerWidth > 900) {
            closeMobileMenu();
        }
    });
}


/* =========================================================
   DRAFT AUTOSAVE
========================================================= */

function initDraftAutosave() {
    /*
     * This is intentionally generic.
     *
     * If a future feeling composer contains:
     * data-feeling-draft
     *
     * it will automatically save the text locally.
     *
     * Passwords, authentication tokens and credentials
     * are NEVER saved here.
     */

    const draftInputs =
        $$("[data-feeling-draft]");

    if (!draftInputs.length) {
        return;
    }

    draftInputs.forEach((input) => {
        const draft = getFeelingDraft();

        if (
            draft &&
            typeof draft.text === "string" &&
            input.value === ""
        ) {
            input.value = draft.text;
        }

        input.addEventListener(
            "input",
            () => {
                saveFeelingDraft({
                    text: input.value
                });
            }
        );
    });
}


/* =========================================================
   PAGE VISIBILITY
========================================================= */

function initVisibilityHandling() {
    document.addEventListener(
        "visibilitychange",
        () => {
            /*
             * Keep this lightweight.
             *
             * Future feed/chat modules can use this event
             * for refreshing stale data.
             */
            if (document.visibilityState === "visible") {
                updateAuthenticatedUI(auth.currentUser);
            }
        }
    );
}


/* =========================================================
   GLOBAL ERROR HANDLING
========================================================= */

function initGlobalErrorHandling() {
    window.addEventListener(
        "error",
        (event) => {
            console.error(
                "Global JavaScript error:",
                event.error || event.message
            );
        }
    );

    window.addEventListener(
        "unhandledrejection",
        (event) => {
            console.error(
                "Unhandled Promise rejection:",
                event.reason
            );
        }
    );
}


/* =========================================================
   APP PUBLIC API
========================================================= */

window.ListenMyFeelings = {
    version: APP_VERSION,

    auth,

    saveFeelingDraft,
    getFeelingDraft,
    clearFeelingDraft,

    showToast,

    openLogin: showLoginModal,
    openSignup: showSignupModal,
    openForgotPassword: showForgotPasswordModal,

    closeModal,
    closeAllModals,

    getCurrentUser: () => auth.currentUser
};


/* =========================================================
   APP INITIALIZATION
========================================================= */

async function initializeApp() {
    try {
        updateCurrentYear();

        initPrivacyNotice();

        initClickHandling();
        initKeyboardHandling();

        initForms();
        initInputValidation();

        initHeaderScrollState();
        initResponsiveCleanup();

        initDraftAutosave();
        initVisibilityHandling();

        initGlobalErrorHandling();

        initAuthState();

        hidePageLoader();

        document.documentElement.dataset.appReady =
            "true";

        console.info(
            `${APP_NAME} v${APP_VERSION} initialized.`
        );
    } catch (error) {
        console.error(
            "Application initialization failed:",
            error
        );

        hidePageLoader();

        showToast(
            "Some features could not be initialized. Please refresh the page.",
            "error"
        );
    }
}


/* =========================================================
   START
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeApp,
        {
            once: true
        }
    );
} else {
    initializeApp();
}
