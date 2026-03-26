diff --git a/chrome/browser/browseros/core/browseros_keychain_recovery.mm b/chrome/browser/browseros/core/browseros_keychain_recovery.mm
new file mode 100644
index 0000000000000..0000000000001
--- /dev/null
+++ b/chrome/browser/browseros/core/browseros_keychain_recovery.mm
@@ -0,0 +1,120 @@
+// Copyright 2026 BrowserOS Authors. All rights reserved.
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include "chrome/browser/browseros/core/browseros_keychain_recovery.h"
+
+#import <Foundation/Foundation.h>
+#import <Security/Security.h>
+#import <Security/SecCode.h>
+
+#include "base/logging.h"
+
+#if !defined(__has_feature) || !__has_feature(objc_arc)
+#error "This file requires ARC support."
+#endif
+
+namespace browseros {
+
+namespace {
+
+NSString* GetTeamIdentifier() {
+  SecCodeRef code = NULL;
+  if (SecCodeCopySelf(kSecCSDefaultFlags, &code) != errSecSuccess || !code) {
+    return nil;
+  }
+  CFDictionaryRef info = NULL;
+  OSStatus status =
+      SecCodeCopySigningInformation(code, kSecCSDefaultFlags, &info);
+  CFRelease(code);
+  if (status != errSecSuccess || !info) {
+    return nil;
+  }
+  NSString* teamID = [(__bridge NSDictionary*)info
+      objectForKey:(__bridge NSString*)kSecCodeInfoTeamIdentifier];
+  NSString* result = [teamID copy];
+  CFRelease(info);
+  return result;
+}
+
+NSString* GetAccessGroup() {
+  NSString* teamID = GetTeamIdentifier();
+  if (!teamID || teamID.length == 0) {
+    return nil;
+  }
+  return [NSString stringWithFormat:@"%@.com.browseros", teamID];
+}
+
+}  // namespace
+
+void MaybeMigrateKeychainAccess() {
+  @autoreleasepool {
+    NSDictionary* query = @{
+      (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
+      (__bridge id)kSecAttrService : @"BrowserOS Safe Storage",
+      (__bridge id)kSecAttrAccount : @"BrowserOS",
+      (__bridge id)kSecReturnData : @YES,
+    };
+
+    CFTypeRef result = NULL;
+    OSStatus status =
+        SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
+
+    if (status == errSecSuccess) {
+      // Access works. Migrate the item to the access group if needed.
+      if (result) {
+        CFRelease(result);
+      }
+      NSString* group = GetAccessGroup();
+      if (group) {
+        NSDictionary* updateQuery = @{
+          (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
+          (__bridge id)kSecAttrService : @"BrowserOS Safe Storage",
+          (__bridge id)kSecAttrAccount : @"BrowserOS",
+        };
+        NSDictionary* update = @{
+          (__bridge id)kSecAttrAccessGroup : group,
+        };
+        SecItemUpdate((__bridge CFDictionaryRef)updateQuery,
+                      (__bridge CFDictionaryRef)update);
+      }
+      LOG(INFO) << "browseros: Keychain access OK";
+      return;
+    }
+
+    if (status == errSecItemNotFound) {
+      LOG(INFO)
+          << "browseros: No keychain item found, will be created on first use";
+      return;
+    }
+
+    // errSecAuthFailed, errSecInteractionNotAllowed, etc.
+    // The item exists but we can't access it — signing identity mismatch.
+    LOG(WARNING) << "browseros: Keychain access denied (status=" << status
+                 << "), attempting interactive recovery";
+
+    SecKeychainSetUserInteractionAllowed(TRUE);
+
+    result = NULL;
+    status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
+
+    if (status == errSecSuccess) {
+      LOG(INFO) << "browseros: Keychain access recovered via user interaction";
+      if (result) {
+        CFRelease(result);
+      }
+      // Migrate to access group now that we have access.
+      NSString* group = GetAccessGroup();
+      if (group) {
+        NSDictionary* updateQuery = @{
+          (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
+          (__bridge id)kSecAttrService : @"BrowserOS Safe Storage",
+          (__bridge id)kSecAttrAccount : @"BrowserOS",
+        };
+        NSDictionary* update = @{
+          (__bridge id)kSecAttrAccessGroup : group,
+        };
+        SecItemUpdate((__bridge CFDictionaryRef)updateQuery,
+                      (__bridge CFDictionaryRef)update);
+      }
+      return;
+    }
+
+    LOG(ERROR) << "browseros: Keychain recovery failed (status=" << status
+               << "). User will lose encrypted data.";
+    if (result) {
+      CFRelease(result);
+    }
+  }
+}
+
+}  // namespace browseros
