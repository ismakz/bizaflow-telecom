// ============================================
// Bizaflow Telecom — Firestore Security Rules
// ============================================
//
// Deploy these rules in Firebase Console:
// Firestore Database → Rules → Paste → Publish
//
// STRUCTURE:
// - telecom_users/{uid}         → User profiles
// - telecom_config/{doc}        → System config (BZT counter)
// - telecom_contacts/{uid}/...  → User contacts (sub-collection)
// - telecom_calls/{callId}      → Call history
//
// ROLES: ceo | admin | agent | business | user
// STATUS: approved | pending | rejected | suspended
//

const RULES = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helper Functions ──────────────────────

    function isAuth() {
      return request.auth != null;
    }

    function getUserData() {
      return get(/databases/$(database)/documents/telecom_users/$(request.auth.uid)).data;
    }

    function isCEO() {
      return isAuth() && getUserData().role == "ceo";
    }

    function isApproved() {
      return isAuth() && getUserData().status == "approved";
    }

    function isOwner(uid) {
      return isAuth() && request.auth.uid == uid;
    }

    function isSelfProfileSafeUpdate() {
      return request.resource.data.uid == resource.data.uid &&
        request.resource.data.email == resource.data.email &&
        request.resource.data.telecomNumber == resource.data.telecomNumber &&
        request.resource.data.role == resource.data.role &&
        request.resource.data.status == resource.data.status &&
        request.resource.data.balance == resource.data.balance &&
        request.resource.data.createdAt == resource.data.createdAt &&
        request.resource.data.approvedAt == resource.data.approvedAt &&
        request.resource.data.approvedBy == resource.data.approvedBy;
    }

    // ── Telecom Users ─────────────────────────
    // CEO: full access to all users
    // User: can create own doc (signup), read/update own doc
    match /telecom_users/{uid} {
      // Read:
      // - own profile
      // - CEO reads all
      // - approved users can query approved records for dialer fallback
      allow read: if isOwner(uid) || isCEO() || (
        isApproved() && resource.data.status == "approved"
      );

      // Create: any authenticated user can create their OWN profile (signup)
      allow create: if isOwner(uid);

      // Update:
      // - owner: cannot modify security-critical fields (balance/status/role/etc.)
      // - CEO: full control for approvals, suspensions, role, balance ops
      allow update: if (isOwner(uid) && isSelfProfileSafeUpdate()) || isCEO();

      // Delete: CEO only
      allow delete: if isCEO();
    }

    // ── Public telecom directory (safe fields only) ──
    match /telecom_directory/{uid} {
      allow read: if isApproved();
      allow create, update: if isOwner(uid) || isCEO();
      allow delete: if isCEO();
    }

    // ── Telecom Config (BZT Counter) ──────────
    // Any authenticated user needs read/write for BZT number generation
    // during signup (runTransaction on counter doc)
    match /telecom_config/{doc} {
      allow read, write: if isAuth();
    }

    // ── Contacts ──────────────────────────────
    // Users manage ONLY their own contacts
    // Must be approved to access
    match /telecom_contacts/{uid}/contacts/{contactId} {
      allow read, write: if isOwner(uid) && isApproved();
    }

    // ── Calls ─────────────────────────────────
    // Any approved user can read/write call records
    match /telecom_calls/{callId} {
      allow read, write: if isApproved();
    }

    // ── Transactions ──────────────────────────
    // Users read only their own transactions
    // Writes require approved status (atomic operations create these)
    // CEO can read all transactions
    match /telecom_transactions/{txId} {
      allow read: if isApproved() && (
        resource.data.userId == request.auth.uid || isCEO()
      );
      allow create: if isApproved();
      allow update, delete: if isCEO();
    }

    // ── Packs catalogue ───────────────────────
    match /telecom_packs/{packId} {
      allow read: if isApproved();
      allow create, update, delete: if isCEO();
    }

    // ── User packs ────────────────────────────
    match /telecom_user_packs/{userPackId} {
      allow read: if isApproved() && (
        resource.data.userId == request.auth.uid || isCEO()
      );
      allow create: if isApproved() && (
        request.resource.data.userId == request.auth.uid || isCEO()
      );
      allow update, delete: if isCEO();
    }
  }
}
`;

export default RULES;
