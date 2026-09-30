/*
 * Listen My Feelings
 * app.js
 *
 * Main authenticated application controller.
 *
 * Responsibilities:
 * - Authentication state
 * - Firestore public feelings feed
 * - Create feelings
 * - Search
 * - Feed filtering
 * - I Understand reactions
 * - Local draft saving
 * - Basic navigation
 *
 * Security:
 * - Passwords are never stored here.
 * - Authentication is handled by Firebase Auth.
 * - Connection access is NOT trusted from Local Storage.
 * - Connection creation must happen through a trusted backend
 *   after rewarded-ad verification.
 */

import {
    auth,
    db
} from "../firebase/firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    doc,
    setDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {
    maxFeelingLength: 2000,
    feedLimit: 30,
    draftKey: "lmf_feeling_draft"
};


/* =========================================================
   STATE
========================================================= */

const state = {
    user: null,
    feelings: [],
    understood: new Set(),
    search: "",
    filter: "latest",
    unsubscribeFeed: null
};


/* =========================================================
   DOM
========================================================= */

const dom = {
    feed:
        document.getElementById("feed-list"),

    input:
        document.getElementById("feeling-input"),

    mood:
        document.getElementById("feeling-mood"),

    topic:
        document.getElementById("feeling-topic"),

    publish:
        document.getElementById("publish-feeling"),

    count:
        document.getElementById("character-count"),

    search:
        document.getElementById("feed-search"),

    filter:
        document.getElementById("feed-filter"),

    avatar:
        document.getElementById("composer-avatar"),

    logout:
        document.getElementById("logout-button")
};


/* =========================================================
   SAFE TEXT
========================================================= */

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   TOAST
========================================================= */

function toast(message, type = "info") {

    if (
        window.ListenMyFeelings &&
        typeof window.ListenMyFeelings.showToast ===
            "function"
    ) {
        window.ListenMyFeelings.showToast(
            message,
            type
        );

        return;
    }

    console.log(message);
}


/* =========================================================
   USER INITIAL
========================================================= */

function getInitial(user) {

    const value =
        user?.displayName ||
        user?.email ||
        "U";

    return value
        .trim()
        .charAt(0)
        .toUpperCase();
}


/* =========================================================
   TIME FORMAT
========================================================= */

function formatTime(timestamp) {

    if (!timestamp) {
        return "Just now";
    }

    try {

        const date =
            typeof timestamp.toDate === "function"
                ? timestamp.toDate()
                : new Date(timestamp);

        const difference =
            Date.now() -
            date.getTime();

        const minutes =
            Math.floor(
                difference / 60000
            );

        if (minutes < 1) {
            return "Just now";
        }

        if (minutes < 60) {
            return `${minutes}m`;
        }

        const hours =
            Math.floor(
                minutes / 60
            );

        if (hours < 24) {
            return `${hours}h`;
        }

        const days =
            Math.floor(
                hours / 24
            );

        if (days < 7) {
            return `${days}d`;
        }

        return date.toLocaleDateString();

    } catch {
        return "Recently";
    }
}


/* =========================================================
   AUTHENTICATION
========================================================= */

function initializeAuthentication() {

    onAuthStateChanged(
        auth,
        async (user) => {

            state.user = user;

            if (!user) {

                stopFeed();

                /*
                 * app.html is a protected page.
                 */
                window.location.replace(
                    "index.html"
                );

                return;
            }

            updateUserUI(user);

            restoreDraft();

            startFeed();
        }
    );
}


/* =========================================================
   USER UI
========================================================= */

function updateUserUI(user) {

    if (dom.avatar) {

        dom.avatar.textContent =
            getInitial(user);
    }

    document
        .querySelectorAll(
            "[data-user-name]"
        )
        .forEach(
            (element) => {

                element.textContent =
                    user.displayName ||
                    user.email?.split("@")[0] ||
                    "Listener";
            }
        );

    document
        .querySelectorAll(
            "[data-user-email]"
        )
        .forEach(
            (element) => {

                element.textContent =
                    user.email || "";
            }
        );
}


/* =========================================================
   FEED START
========================================================= */

function startFeed() {

    stopFeed();

    if (!dom.feed) {
        return;
    }

    dom.feed.innerHTML = `
        <div class="empty-state">

            <div class="empty-icon">
                ◌
            </div>

            <h3>
                Loading feelings...
            </h3>

            <p>
                Finding something worth listening to.
            </p>

        </div>
    `;

    const feelingsCollection =
        collection(
            db,
            "feelings"
        );

    const feedQuery =
        query(
            feelingsCollection,

            where(
                "visibility",
                "==",
                "public"
            ),

            where(
                "status",
                "==",
                "active"
            ),

            orderBy(
                "createdAt",
                "desc"
            ),

            limit(
                CONFIG.feedLimit
            )
        );

    state.unsubscribeFeed =
        onSnapshot(
            feedQuery,

            (snapshot) => {

                state.feelings =
                    snapshot.docs.map(
                        (document) => ({
                            id:
                                document.id,

                            ...document.data()
                        })
                    );

                renderFeed();
            },

            (error) => {

                console.error(
                    "Feed listener error:",
                    error
                );

                renderFeedError();
            }
        );
}


/* =========================================================
   STOP FEED
========================================================= */

function stopFeed() {

    if (
        typeof state.unsubscribeFeed ===
        "function"
    ) {

        state.unsubscribeFeed();

        state.unsubscribeFeed =
            null;
    }
}


/* =========================================================
   FEED ERROR
========================================================= */

function renderFeedError() {

    if (!dom.feed) {
        return;
    }

    dom.feed.innerHTML = `
        <div class="empty-state">

            <div class="empty-icon">
                !
            </div>

            <h3>
                Feed couldn't load
            </h3>

            <p>
                Please refresh the page and try again.
            </p>

        </div>
    `;
}


/* =========================================================
   FILTER FEELINGS
========================================================= */

function getFilteredFeelings() {

    let feelings =
        [...state.feelings];

    const search =
        state.search
            .trim()
            .toLowerCase();

    if (search) {

        feelings =
            feelings.filter(
                (feeling) => {

                    const text =
                        String(
                            feeling.text || ""
                        ).toLowerCase();

                    const mood =
                        String(
                            feeling.mood || ""
                        ).toLowerCase();

                    const topic =
                        String(
                            feeling.topic || ""
                        ).toLowerCase();

                    const author =
                        String(
                            feeling.authorDisplayName ||
                            ""
                        ).toLowerCase();

                    return (
                        text.includes(search) ||
                        mood.includes(search) ||
                        topic.includes(search) ||
                        author.includes(search)
                    );
                }
            );
    }

    if (
        state.filter ===
        "understood"
    ) {

        feelings.sort(
            (a, b) =>
                Number(
                    b.understoodCount || 0
                ) -
                Number(
                    a.understoodCount || 0
                )
        );
    }

    return feelings;
}


/* =========================================================
   RENDER FEED
========================================================= */

function renderFeed() {

    if (!dom.feed) {
        return;
    }

    const feelings =
        getFilteredFeelings();

    if (!feelings.length) {

        dom.feed.innerHTML = `
            <div class="empty-state">

                <div class="empty-icon">
                    ♡
                </div>

                <h3>
                    No feelings found
                </h3>

                <p>
                    Be the first person to share
                    something real.
                </p>

            </div>
        `;

        return;
    }

    dom.feed.innerHTML =
        feelings
            .map(
                createFeelingCard
            )
            .join("");

    bindFeedActions();
}


/* =========================================================
   FEELING CARD
========================================================= */

function createFeelingCard(feeling) {

    const author =
        feeling.authorDisplayName ||
        "Listener";

    const initial =
        escapeHTML(
            author
                .trim()
                .charAt(0)
                .toUpperCase()
        );

    const text =
        escapeHTML(
            feeling.text || ""
        );

    const mood =
        feeling.mood
            ? `
                <span class="feeling-tag">
                    ${escapeHTML(
                        feeling.mood
                    )}
                </span>
              `
            : "";

    const topic =
        feeling.topic
            ? `
                <span class="feeling-tag">
                    ${escapeHTML(
                        feeling.topic
                    )}
                </span>
              `
            : "";

    const understoodCount =
        Number(
            feeling.understoodCount || 0
        );

    const alreadyUnderstood =
        state.understood.has(
            feeling.id
        );

    const isOwn =
        state.user?.uid ===
        feeling.authorId;

    return `
        <article
            class="feeling-card"
            data-feeling-id="${escapeHTML(
                feeling.id
            )}"
        >

            <div class="feeling-head">

                <div class="person">

                    <div class="avatar">
                        ${initial}
                    </div>

                    <div class="person-info">

                        <strong>
                            ${escapeHTML(
                                author
                            )}
                        </strong>

                        <small>
                            ${formatTime(
                                feeling.createdAt
                            )}
                        </small>

                    </div>

                </div>

                <button
                    class="more-btn"
                    type="button"
                    data-report-id="${escapeHTML(
                        feeling.id
                    )}"
                    aria-label="More options"
                >
                    •••
                </button>

            </div>


            <div class="feeling-text">
                ${text}
            </div>


            ${
                mood || topic
                    ? `
                        <div class="feeling-tags">
                            ${mood}
                            ${topic}
                        </div>
                      `
                    : ""
            }


            <div class="feeling-actions">

                <button
                    class="feeling-action ${
                        alreadyUnderstood
                            ? "understood"
                            : ""
                    }"
                    type="button"
                    data-understand-id="${escapeHTML(
                        feeling.id
                    )}"
                >
                    ♡ I Understand
                    ${
                        understoodCount > 0
                            ? ` · ${understoodCount}`
                            : ""
                    }
                </button>


                <button
                    class="feeling-action"
                    type="button"
                    data-respond-id="${escapeHTML(
                        feeling.id
                    )}"
                >
                    💬 Respond
                </button>


                <button
                    class="feeling-action"
                    type="button"
                    data-connect-id="${escapeHTML(
                        feeling.authorId || ""
                    )}"
                    ${
                        isOwn
                            ? "disabled"
                            : ""
                    }
                >
                    🤝 Connect
                </button>

            </div>

        </article>
    `;
}


/* =========================================================
   FEED ACTIONS
========================================================= */

function bindFeedActions() {

    document
        .querySelectorAll(
            "[data-understand-id]"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        toggleUnderstand(
                            button.dataset
                                .understandId
                        );
                    }
                );
            }
        );


    document
        .querySelectorAll(
            "[data-respond-id]"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        respondToFeeling(
                            button.dataset
                                .respondId
                        );
                    }
                );
            }
        );


    document
        .querySelectorAll(
            "[data-connect-id]"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        requestConnection(
                            button.dataset
                                .connectId
                        );
                    }
                );
            }
        );


    document
        .querySelectorAll(
            "[data-report-id]"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        reportFeeling(
                            button.dataset
                                .reportId
                        );
                    }
                );
            }
        );
}


/* =========================================================
   I UNDERSTAND
========================================================= */

async function toggleUnderstand(
    feelingId
) {

    if (!state.user) {

        toast(
            "Please sign in first.",
            "error"
        );

        return;
    }

    if (!feelingId) {
        return;
    }

    const reactionRef =
        doc(
            db,
            "feelings",
            feelingId,
            "understands",
            state.user.uid
        );

    const alreadyUnderstood =
        state.understood.has(
            feelingId
        );

    try {

        if (alreadyUnderstood) {

            await deleteDoc(
                reactionRef
            );

            state.understood.delete(
                feelingId
            );

        } else {

            await setDoc(
                reactionRef,
                {
                    userId:
                        state.user.uid,

                    createdAt:
                        serverTimestamp()
                }
            );

            state.understood.add(
                feelingId
            );
        }

        renderFeed();

    } catch (error) {

        console.error(
            "I Understand error:",
            error
        );

        toast(
            "We couldn't update this response.",
            "error"
        );
    }
}


/* =========================================================
   CREATE FEELING
========================================================= */

async function createFeeling() {

    if (!state.user) {

        toast(
            "Please sign in first.",
            "error"
        );

        return;
    }

    const text =
        dom.input?.value
            ?.trim() || "";

    const mood =
        dom.mood?.value || "";

    const topic =
        dom.topic?.value || "";

    if (!text) {

        toast(
            "Write something before sharing.",
            "error"
        );

        dom.input?.focus();

        return;
    }

    if (
        text.length >
        CONFIG.maxFeelingLength
    ) {

        toast(
            `Your feeling can contain up to ${CONFIG.maxFeelingLength} characters.`,
            "error"
        );

        return;
    }

    if (dom.publish) {

        dom.publish.disabled =
            true;

        dom.publish.textContent =
            "Sharing...";
    }

    try {

        await addDoc(
            collection(
                db,
                "feelings"
            ),
            {

                authorId:
                    state.user.uid,

                authorDisplayName:
                    state.user.displayName ||
                    state.user.email
                        ?.split("@")[0] ||
                    "Listener",

                text,

                mood,

                topic,

                visibility:
                    "public",

                status:
                    "active",

                understoodCount:
                    0,

                createdAt:
                    serverTimestamp(),

                updatedAt:
                    serverTimestamp()
            }
        );

        clearDraft();

        if (dom.input) {
            dom.input.value = "";
        }

        if (dom.mood) {
            dom.mood.value = "";
        }

        if (dom.topic) {
            dom.topic.value = "";
        }

        updateCharacterCount();

        toast(
            "Your feeling has been shared.",
            "success"
        );

    } catch (error) {

        console.error(
            "Create feeling error:",
            error
        );

        toast(
            "Your feeling couldn't be shared.",
            "error"
        );

    } finally {

        if (dom.publish) {

            dom.publish.disabled =
                false;

            dom.publish.textContent =
                "Share feeling";
        }
    }
}


/* =========================================================
   CHARACTER COUNT
========================================================= */

function updateCharacterCount() {

    if (
        !dom.input ||
        !dom.count
    ) {
        return;
    }

    dom.count.textContent =
        `${dom.input.value.length} / ${CONFIG.maxFeelingLength}`;
}


/* =========================================================
   RESPOND
========================================================= */

function respondToFeeling(
    feelingId
) {

    const feeling =
        state.feelings.find(
            item =>
                item.id === feelingId
        );

    if (!feeling) {
        return;
    }

    /*
     * The actual response/thread system will be connected
     * to the Firestore responses subcollection.
     *
     * We intentionally don't create fake response data here.
     */

    if (dom.input) {

        dom.input.focus();

        dom.input.placeholder =
            "Write something thoughtful...";
    }

    toast(
        "Response composer is ready.",
        "info"
    );
}


/* =========================================================
   CONNECTION
========================================================= */

function requestConnection(
    userId
) {

    if (!state.user) {

        toast(
            "Please sign in first.",
            "error"
        );

        return;
    }

    if (!userId) {
        return;
    }

    if (
        userId ===
        state.user.uid
    ) {

        toast(
            "You cannot connect with yourself.",
            "error"
        );

        return;
    }

    /*
     * IMPORTANT SECURITY RULE:
     *
     * Client never creates:
     *
     * connections/{id}
     *
     * directly.
     *
     * Production flow:
     *
     * User
     *   ↓
     * Rewarded advertisement
     *   ↓
     * Provider verification
     *   ↓
     * Trusted backend
     *   ↓
     * connection document
     *   ↓
     * 12-hour server-controlled expiry
     *
     * This prevents Local Storage or browser time
     * manipulation.
     */

    toast(
        "Connection unlock will be enabled with the verified rewarded-ad system.",
        "info"
    );
}


/* =========================================================
   REPORT
========================================================= */

function reportFeeling(
    feelingId
) {

    if (!state.user) {

        toast(
            "Please sign in first.",
            "error"
        );

        return;
    }

    /*
     * The complete report UI will use:
     *
     * reports/{reportId}
     *
     * with the Firestore security rules already prepared.
     */

    toast(
        "Report and safety tools are being connected.",
        "info"
    );
}


/* =========================================================
   DRAFT
========================================================= */

function saveDraft() {

    if (!dom.input) {
        return;
    }

    try {

        const draft = {
            text:
                dom.input.value,

            mood:
                dom.mood?.value || "",

            topic:
                dom.topic?.value || "",

            savedAt:
                Date.now()
        };

        localStorage.setItem(
            CONFIG.draftKey,
            JSON.stringify(draft)
        );

    } catch (error) {

        console.warn(
            "Draft save failed:",
            error
        );
    }
}


function restoreDraft() {

    try {

        const raw =
            localStorage.getItem(
                CONFIG.draftKey
            );

        if (!raw) {
            return;
        }

        const draft =
            JSON.parse(raw);

        if (!draft) {
            return;
        }

        if (
            dom.input &&
            typeof draft.text ===
                "string"
        ) {

            dom.input.value =
                draft.text;
        }

        if (
            dom.mood &&
            typeof draft.mood ===
                "string"
        ) {

            dom.mood.value =
                draft.mood;
        }

        if (
            dom.topic &&
            typeof draft.topic ===
                "string"
        ) {

            dom.topic.value =
                draft.topic;
        }

        updateCharacterCount();

    } catch (error) {

        console.warn(
            "Draft restore failed:",
            error
        );

        clearDraft();
    }
}


function clearDraft() {

    try {

        localStorage.removeItem(
            CONFIG.draftKey
        );

    } catch {
        // Ignore storage errors.
    }
}


/* =========================================================
   SEARCH
========================================================= */

function initializeSearch() {

    if (!dom.search) {
        return;
    }

    dom.search.addEventListener(
        "input",
        () => {

            state.search =
                dom.search.value;

            renderFeed();
        }
    );
}


/* =========================================================
   FILTER
========================================================= */

function initializeFilter() {

    if (!dom.filter) {
        return;
    }

    dom.filter.addEventListener(
        "change",
        () => {

            state.filter =
                dom.filter.value;

            renderFeed();
        }
    );
}


/* =========================================================
   COMPOSER
========================================================= */

function initializeComposer() {

    if (dom.publish) {

        dom.publish.addEventListener(
            "click",
            createFeeling
        );
    }

    if (dom.input) {

        dom.input.addEventListener(
            "input",
            () => {

                updateCharacterCount();
                saveDraft();
            }
        );
    }

    if (dom.mood) {

        dom.mood.addEventListener(
            "change",
            saveDraft
        );
    }

    if (dom.topic) {

        dom.topic.addEventListener(
            "change",
            saveDraft
        );
    }

    updateCharacterCount();
}


/* =========================================================
   LOGOUT
========================================================= */

function initializeLogout() {

    if (!dom.logout) {
        return;
    }

    dom.logout.addEventListener(
        "click",
        async () => {

            try {

                await signOut(auth);

                window.location.replace(
                    "index.html"
                );

            } catch (error) {

                console.error(
                    "Logout error:",
                    error
                );

                toast(
                    "Unable to log out right now.",
                    "error"
                );
            }
        }
    );
}


/* =========================================================
   APP NAVIGATION
========================================================= */

function initializeNavigation() {

    document
        .querySelectorAll(
            "[data-app-nav]"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        const target =
                            button.dataset
                                .appNav;

                        const routes = {

                            home:
                                "app.html",

                            discover:
                                "discover.html",

                            notifications:
                                "notifications.html",

                            messages:
                                "messages.html",

                            profile:
                                "profile.html",

                            settings:
                                "settings.html"
                        };

                        const route =
                            routes[target];

                        if (!route) {
                            return;
                        }

                        window.location.href =
                            route;
                    }
                );
            }
        );
}


/* =========================================================
   CLEANUP
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        stopFeed();
    }
);


/* =========================================================
   PUBLIC API
========================================================= */

window.ListenMyFeelingsApp = {

    getCurrentUser() {
        return state.user;
    },

    getFeelings() {
        return [...state.feelings];
    },

    refreshFeed() {
        startFeed();
    },

    saveDraft,

    restoreDraft,

    clearDraft
};


/* =========================================================
   INITIALIZATION
========================================================= */

initializeComposer();

initializeSearch();

initializeFilter();

initializeLogout();

initializeNavigation();

initializeAuthentication();
