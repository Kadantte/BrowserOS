diff --git a/components/os_crypt/common/keychain_password_mac.mm b/components/os_crypt/common/keychain_password_mac.mm
index caa0e420956a3..d60a67a8bacb7 100644
--- a/components/os_crypt/common/keychain_password_mac.mm
+++ b/components/os_crypt/common/keychain_password_mac.mm
@@ -8,6 +8,9 @@

 #import <Security/Security.h>

+// BrowserOS: needed for SecCodeCopySelf / SecCodeCopySigningInformation
+#import <Security/SecCode.h>
+
 #include <atomic>

 #include "base/apple/ossstatus_logging.h"
@@ -35,8 +38,46 @@
 const char kDefaultServiceName[] = "Chrome Safe Storage";
 const char kDefaultAccountName[] = "Chrome";
 #else
-const char kDefaultServiceName[] = "Chromium Safe Storage";
-const char kDefaultAccountName[] = "Chromium";
+// BrowserOS: custom keychain service name
+const char kDefaultServiceName[] = "BrowserOS Safe Storage";
+const char kDefaultAccountName[] = "BrowserOS";
 #endif

+// BrowserOS: Get the Team ID from the running binary's code signature
+// and construct the keychain access group (e.g. "ABC123DEF4.com.browseros").
+NSString* GetBrowserOSAccessGroup() {
+  static NSString* cachedGroup = nil;
+  static dispatch_once_t onceToken;
+  dispatch_once(&onceToken, ^{
+    SecCodeRef code = NULL;
+    if (SecCodeCopySelf(kSecCSDefaultFlags, &code) != errSecSuccess || !code) {
+      return;
+    }
+    CFDictionaryRef info = NULL;
+    if (SecCodeCopySigningInformation(code, kSecCSDefaultFlags, &info) == errSecSuccess && info) {
+      NSString* teamID = [(__bridge NSDictionary*)info
+          objectForKey:(__bridge NSString*)kSecCodeInfoTeamIdentifier];
+      if (teamID.length > 0) {
+        cachedGroup = [[NSString alloc] initWithFormat:@"%@.com.browseros", teamID];
+      }
+      CFRelease(info);
+    }
+    CFRelease(code);
+  });
+  return cachedGroup;
+}
+
 // These values are persisted to logs. Entries should not be renumbered and
+
+@@ -58,6 +99,12 @@
+   OSStatus error = keychain.AddGenericPassword(service_name, account_name,
+                                                base::as_byte_span(password));
+
++  // BrowserOS: update the newly created item to use our access group
++  NSString* group = GetBrowserOSAccessGroup();
++  if (group && error == noErr) {
++    NSDictionary* query = @{
++      (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
++      (__bridge id)kSecAttrService: @(service_name.c_str()),
++      (__bridge id)kSecAttrAccount: @(account_name.c_str()),
++    };
++    NSDictionary* update = @{
++      (__bridge id)kSecAttrAccessGroup: group,
++    };
++    SecItemUpdate((__bridge CFDictionaryRef)query,
++                  (__bridge CFDictionaryRef)update);
++  }
++
   if (error != noErr) {
     OSSSTATUS_DLOG(ERROR, error) << "Keychain add failed";
     return base::unexpected(error);
@@ -73,6 +130,14 @@
   auto password = keychain.FindGenericPassword(service_name, account_name);

   if (password.has_value()) {
+    // BrowserOS: ensure existing items have the correct access group.
+    // This migrates items created before the access group was added.
+    NSString* group = GetBrowserOSAccessGroup();
+    if (group) {
+      NSDictionary* query = @{
+        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
+        (__bridge id)kSecAttrService: @(service_name.c_str()),
+        (__bridge id)kSecAttrAccount: @(account_name.c_str()),
+      };
+      NSDictionary* update = @{
+        (__bridge id)kSecAttrAccessGroup: group,
+      };
+      // Best-effort — ignore errors (item may already have the group).
+      SecItemUpdate((__bridge CFDictionaryRef)query,
+                    (__bridge CFDictionaryRef)update);
+    }
     uma_result = FindGenericPasswordResult::kPasswordFound;
     return std::string(base::as_string_view(*password));
