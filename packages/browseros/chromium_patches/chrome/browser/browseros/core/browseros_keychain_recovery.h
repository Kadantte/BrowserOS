diff --git a/chrome/browser/browseros/core/browseros_keychain_recovery.h b/chrome/browser/browseros/core/browseros_keychain_recovery.h
new file mode 100644
index 0000000000000..0000000000001
--- /dev/null
+++ b/chrome/browser/browseros/core/browseros_keychain_recovery.h
@@ -0,0 +1,24 @@
+// Copyright 2026 BrowserOS Authors. All rights reserved.
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_BROWSEROS_CORE_BROWSEROS_KEYCHAIN_RECOVERY_H_
+#define CHROME_BROWSER_BROWSEROS_CORE_BROWSEROS_KEYCHAIN_RECOVERY_H_
+
+namespace browseros {
+
+// Checks whether the BrowserOS Safe Storage keychain item is accessible.
+// If access is denied (e.g. due to a signing identity change after an update),
+// attempts interactive recovery by prompting the user. On success, migrates the
+// keychain item to use the BrowserOS access group so future updates don't break
+// access.
+//
+// Must be called early in browser startup, before any cookie or password access
+// triggers os_crypt to read the keychain.
+void MaybeMigrateKeychainAccess();
+
+}  // namespace browseros
+
+#endif  // CHROME_BROWSER_BROWSEROS_CORE_BROWSEROS_KEYCHAIN_RECOVERY_H_
