// ================================================================================
// FRIDA SCRIPT: Hooking crítico para BDV Digital (com.bancodevenezuela.bdvdigital)
// ================================================================================
// Uso: frida -U -f com.bancodevenezuela.bdvdigital -l bdv_frida_hooks.js --no-pause
// O con archivo: frida -U -f com.bancodevenezuela.bdvdigital -l C:/Users/Osiris/Desktop/bdv_frida_hooks.js
//
// Requiere: dispositivo rooteado O app debuggable + frida-server en dispositivo
// ================================================================================

const PACKAGE = "com.bancodevenezuela.bdvdigital";
const LIBAPP = "libapp.so";

console.log("[*] BDV Digital Frida Hooks cargado");
console.log("[*] Package: " + PACKAGE);
console.log("[*] Librería objetivo: " + LIBAPP);

// ================================================================================
// UTILIDADES
// ================================================================================

function hexdump(ptr, len) {
    return Memory.readByteArray(ptr, len).toString('hex');
}

function logJson(obj, prefix = "") {
    try {
        console.log(prefix + JSON.stringify(obj, null, 2));
    } catch (e) {
        console.log(prefix + "[Error serializando] " + e);
    }
}

function hookMethod(className, methodName, overloads, onEnter, onLeave) {
    try {
        Java.perform(() => {
            const cls = Java.use(className);
            if (!cls[methodName]) {
                console.log("[!] Método no encontrado: " + className + "." + methodName);
                return;
            }
            const method = cls[methodName];
            if (overloads && overloads.length > 0) {
                const overload = method.overload(...overloads);
                overload.implementation = function(...args) {
                    if (onEnter) onEnter.call(this, args);
                    const ret = this[methodName].apply(this, args);
                    if (onLeave) onLeave.call(this, args, ret);
                    return ret;
                };
            } else {
                method.implementation = function(...args) {
                    if (onEnter) onEnter.call(this, args);
                    const ret = this[methodName].apply(this, args);
                    if (onLeave) onLeave.call(this, args, ret);
                    return ret;
                };
            }
            console.log("[+] Hooked: " + className + "." + methodName);
        });
    } catch (e) {
        console.log("[!] Error hooking Java " + className + "." + methodName + ": " + e);
    }
}

// ================================================================================
// HOOK 1: DIO HTTP CLIENT - Interceptar TODOS los requests/responses
// ================================================================================

function hookDio() {
    console.log("[*] Hooking Dio HTTP Client...");
    
    // Dio BaseOptions / RequestOptions
    hookMethod("dio.Dio", "fetch", ["dio.RequestOptions", "java.util.Map"], 
        function(args) {
            const options = args[0];
            const headers = args[1];
            console.log("\n========== DIO REQUEST ==========");
            console.log("URL: " + options.uri);
            console.log("Method: " + options.method);
            console.log("Headers:");
            if (headers) {
                const iter = headers.keySet().iterator();
                while (iter.hasNext()) {
                    const key = iter.next();
                    console.log("  " + key + ": " + headers.get(key));
                }
            }
            console.log("Data: " + options.data);
            
            // Extraer app-key si está presente
            if (headers) {
                const appKey = headers.get("app-key") || headers.get("App-Key") || headers.get("APP-KEY");
                if (appKey) {
                    console.log(">>> APP-KEY ENCONTRADO: " + appKey);
                }
                const auth = headers.get("Authorization") || headers.get("authorization");
                if (auth) {
                    console.log(">>> AUTH: " + auth.substring(0, 50) + "...");
                }
            }
        },
        function(args, ret) {
            console.log("========== DIO RESPONSE ==========");
            if (ret) {
                console.log("Status: " + ret.statusCode);
                console.log("Data: " + ret.data);
                console.log("Headers:");
                if (ret.headers) {
                    const iter = ret.headers.map.keySet().iterator();
                    while (iter.hasNext()) {
                        const key = iter.next();
                        console.log("  " + key + ": " + ret.headers.map.get(key));
                    }
                }
            }
            console.log("==================================\n");
        }
    );
    
    // Dio Interceptor - request
    hookMethod("dio.interceptor.Interceptor", "onRequest", ["dio.RequestOptions", "dio.RequestInterceptorHandler"],
        function(args) {
            const options = args[0];
            console.log("[Dio Interceptor] Request: " + options.method + " " + options.uri);
        },
        function(args, ret) {}
    );
    
    // Dio Interceptor - response
    hookMethod("dio.interceptor.Interceptor", "onResponse", ["dio.Response", "dio.ResponseInterceptorHandler"],
        function(args) {
            const response = args[0];
            console.log("[Dio Interceptor] Response: " + response.statusCode + " " + response.requestOptions.uri);
        },
        function(args, ret) {}
    );
    
    // Dio Interceptor - error
    hookMethod("dio.interceptor.Interceptor", "onError", ["dio.DioError", "dio.ErrorInterceptorHandler"],
        function(args) {
            const error = args[0];
            console.log("[Dio Interceptor] ERROR: " + error.message + " | " + error.requestOptions?.uri);
        },
        function(args, ret) {}
    );
}

// ================================================================================
// HOOK 2: FUNCIONES DART CRÍTICAS (vía libapp.so - requiere symbols)
// ================================================================================

function hookDartFunctions() {
    console.log("[*] Hooking funciones Dart críticas en libapp.so...");
    
    // Esperar a que libapp.so se cargue
    const libapp = Module.findBaseAddress(LIBAPP);
    if (!libapp) {
        console.log("[!] libapp.so no cargado aún, esperando...");
        setTimeout(hookDartFunctions, 1000);
        return;
    }
    
    console.log("[+] libapp.so base: " + libapp);
    
    // Enumerar exports de libapp.so
    const exports = Module.enumerateExportsSync(LIBAPP);
    console.log("[*] Exports encontrados: " + exports.length);
    
    // Buscar funciones por nombre (Dart AOT usa nombres mangled)
    const targetPatterns = [
        "consultaReglaCompra",
        "ejecutar.*microcompra",
        "consultarReglasEXRI",
        "getReglasByMonedaRetiro",
        "encodeQr7b",
        "decodeQr7b"
    ];
    
    exports.forEach(exp => {
        targetPatterns.forEach(pattern => {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(exp.name)) {
                console.log("[+] Encontrado export: " + exp.name + " @ " + exp.address);
                hookNativeFunction(exp.address, exp.name);
            }
        });
    });
    
    // También escanear símbolos en memoria
    const symbols = Module.enumerateSymbolsSync(LIBAPP);
    symbols.forEach(sym => {
        targetPatterns.forEach(pattern => {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(sym.name)) {
                console.log("[+] Encontrado símbolo: " + sym.name + " @ " + sym.address);
                hookNativeFunction(sym.address, sym.name);
            }
        });
    });
}

function hookNativeFunction(address, name) {
    try {
        Interceptor.attach(address, {
            onEnter: function(args) {
                console.log("\n========== NATIVE CALL: " + name + " ==========");
                console.log("Address: " + address);
                console.log("Args count: " + arguments.length);
                for (let i = 0; i < arguments.length; i++) {
                    console.log("  arg[" + i + "]: " + args[i]);
                    // Intentar leer como string si parece puntero
                    try {
                        const str = args[i].readUtf8String();
                        if (str && str.length > 0 && str.length < 500) {
                            console.log("    -> string: " + str);
                        }
                    } catch (e) {}
                    try {
                        const json = args[i].readUtf8String();
                        if (json && json.startsWith("{")) {
                            console.log("    -> JSON: " + json.substring(0, 500));
                        }
                    } catch (e) {}
                }
                this.startTime = Date.now();
            },
            onLeave: function(retval) {
                console.log("Return: " + retval);
                console.log("Duration: " + (Date.now() - this.startTime) + "ms");
                console.log("===============================================\n");
            }
        });
        console.log("[+] Hooked native: " + name);
    } catch (e) {
        console.log("[!] Error hooking native " + name + ": " + e);
    }
}

// ================================================================================
// HOOK 3: SECURE SOCKET / CERTIFICATE PINNING
// ================================================================================

function hookCertificatePinning() {
    console.log("[*] Hooking Certificate Pinning / SecureSocket...");
    
    // Dart SecureSocket callbacks
    hookMethod("io.flutter.embedding.engine.dart.DartMessenger", "send", ["java.lang.String", "java.nio.ByteBuffer"],
        function(args) {
            const channel = args[0];
            if (channel && (channel.includes("secure") || channel.includes("certificate") || channel.includes("pin"))) {
                console.log("[Dart Messenger] Channel: " + channel);
            }
        },
        function(args, ret) {}
    );
    
    // Android SSLContext / TrustManager
    hookMethod("javax.net.ssl.SSLContext", "init", 
        ["[Ljavax.net.ssl.KeyManager;", "[Ljavax.net.ssl.TrustManager;", "java.security.SecureRandom"],
        function(args) {
            console.log("[SSLContext.init] KeyManagers: " + (args[0] ? args[0].length : "null"));
            console.log("[SSLContext.init] TrustManagers: " + (args[1] ? args[1].length : "null"));
            if (args[1]) {
                for (let i = 0; i < args[1].length; i++) {
                    const tm = args[1][i];
                    console.log("  TrustManager[" + i + "]: " + tm.$className);
                    // Hook checkServerTrusted
                    hookMethod(tm.$className, "checkServerTrusted", 
                        ["[Ljava.security.cert.X509Certificate;", "java.lang.String"],
                        function(args) {
                            console.log("[TrustManager.checkServerTrusted] Certs: " + args[0].length + ", Auth: " + args[1]);
                            for (let j = 0; j < args[0].length; j++) {
                                const cert = args[0][j];
                                console.log("  Cert[" + j + "]: " + cert.getSubjectDN() + " | Issuer: " + cert.getIssuerDN());
                                // SHA-256 fingerprint
                                const digest = cert.getDigest("SHA-256");
                                if (digest) console.log("    SHA-256: " + bytesToHex(digest));
                            }
                        },
                        function(args, ret) {}
                    );
                }
            }
        },
        function(args, ret) {}
    );
    
    // OkHttp CertificatePinner
    hookMethod("okhttp3.CertificatePinner", "check", ["java.lang.String", "java.util.List"],
        function(args) {
            console.log("[CertificatePinner.check] Host: " + args[0]);
            console.log("  Pins: " + args[1]);
        },
        function(args, ret) {}
    );
    
    // Conscrypt / OpenSSL
    hookMethod("com.google.android.gms.org.conscrypt.ConscryptHostnameVerifier", "verify",
        ["java.lang.String", "javax.net.ssl.SSLSession"],
        function(args) {
            console.log("[ConscryptHostnameVerifier.verify] Host: " + args[0]);
        },
        function(args, ret) {
            console.log("[ConscryptHostnameVerifier.verify] Result: " + ret);
        }
    );
}

function bytesToHex(bytes) {
    return Array.from(bytes, b => ('00' + (b & 0xFF).toString(16)).slice(-2)).join(':');
}

// ================================================================================
// HOOK 4: OAUTH / AUTENTICACIÓN
// ================================================================================

function hookOAuth() {
    console.log("[*] Hooking OAuth / Autenticación...");
    
    // Buscar clases que manejen OAuth
    Java.enumerateLoadedClasses({
        onMatch: function(className) {
            if (className.toLowerCase().includes("oauth") || 
                className.toLowerCase().includes("auth") ||
                className.toLowerCase().includes("token")) {
                console.log("[ClassFound] " + className);
            }
        },
        onComplete: function() {}
    });
    
    // Hook SharedPreferences para ver tokens guardados
    hookMethod("android.content.SharedPreferences", "getString", ["java.lang.String", "java.lang.String"],
        function(args) {
            const key = args[0];
            if (key && (key.includes("token") || key.includes("access") || key.includes("refresh") || key.includes("auth"))) {
                console.log("[SharedPreferences.getString] Key: " + key);
            }
        },
        function(args, ret) {
            const key = args[0];
            if (key && (key.includes("token") || key.includes("access") || key.includes("refresh") || key.includes("auth"))) {
                console.log("[SharedPreferences.getString] Key: " + key + " -> Value: " + (ret ? ret.substring(0, 100) : "null"));
            }
        }
    );
    
    hookMethod("android.content.SharedPreferences$Editor", "putString", ["java.lang.String", "java.lang.String"],
        function(args) {
            const key = args[0];
            const value = args[1];
            if (key && (key.includes("token") || key.includes("access") || key.includes("refresh") || key.includes("auth") || key.includes("client"))) {
                console.log("[SharedPreferences.putString] Key: " + key + " -> Value: " + (value ? value.substring(0, 100) : "null"));
            }
        },
        function(args, ret) {}
    );
}

// ================================================================================
// HOOK 5: METHOD CHANNEL (suicheChannel) - QR encode/decode
// ================================================================================

function hookMethodChannel() {
    console.log("[*] Hooking MethodChannel (suicheChannel)...");
    
    hookMethod("io.flutter.plugin.common.MethodChannel", "invokeMethod", ["java.lang.String", "java.lang.Object"],
        function(args) {
            const method = args[0];
            const args_obj = args[1];
            console.log("[MethodChannel.invokeMethod] Method: " + method);
            console.log("  Args: " + args_obj);
        },
        function(args, ret) {
            console.log("[MethodChannel.invokeMethod] Result: " + ret);
        }
    );
    
    hookMethod("io.flutter.plugin.common.MethodChannel", "setMethodCallHandler", ["io.flutter.plugin.common.MethodChannel$MethodCallHandler"],
        function(args) {
            console.log("[MethodChannel.setMethodCallHandler] Handler set");
        },
        function(args, ret) {}
    );
    
    // BinaryMessenger para canales de bajo nivel
    hookMethod("io.flutter.embedding.engine.dart.DartMessenger", "send", ["java.lang.String", "java.nio.ByteBuffer"],
        function(args) {
            const channel = args[0];
            if (channel && channel.includes("suiche")) {
                console.log("[DartMessenger.send] suicheChannel: " + channel);
                const buffer = args[1];
                if (buffer) {
                    const bytes = Java.array('byte', buffer.remaining());
                    buffer.get(bytes);
                    console.log("  Data (" + bytes.length + " bytes): " + bytesToHex(bytes).substring(0, 200));
                }
            }
        },
        function(args, ret) {}
    );
}

// ================================================================================
// HOOK 6: CLAVE MÓVIL / OTP
// ================================================================================

function hookClaveMovil() {
    console.log("[*] Hooking Clave Móvil / OTP...");
    
    Java.enumerateLoadedClasses({
        onMatch: function(className) {
            if (className.toLowerCase().includes("clavemovil") ||
                className.toLowerCase().includes("clave_movil") ||
                className.toLowerCase().includes("otp") ||
                className.toLowerCase().includes("verificacion")) {
                console.log("[ClaveMovil Class] " + className);
            }
        },
        onComplete: function() {}
    });
}

// ================================================================================
// HOOK 7: ENCRYPTION / AES (Portal bdvenlinea)
// ================================================================================

function hookCrypto() {
    console.log("[*] Hooking Crypto (AES/EBC)...");
    
    // Cipher.doFinal
    hookMethod("javax.crypto.Cipher", "doFinal", ["[B"],
        function(args) {
            const input = args[0];
            console.log("[Cipher.doFinal] Input length: " + input.length);
            if (input.length < 500) {
                console.log("  Input: " + bytesToHex(input));
            }
            this.cipher = this;
        },
        function(args, ret) {
            if (ret && ret.length < 500) {
                console.log("[Cipher.doFinal] Output: " + bytesToHex(ret));
            }
        }
    );
    
    // SecretKeySpec init
    hookMethod("javax.crypto.spec.SecretKeySpec", "$init", ["[B", "java.lang.String"],
        function(args) {
            const key = args[0];
            const algo = args[1];
            console.log("[SecretKeySpec] Algorithm: " + algo + ", Key length: " + key.length);
            if (key.length <= 32) {
                console.log("  Key: " + bytesToHex(key));
            }
        },
        function(args, ret) {}
    );
    
    // IvParameterSpec
    hookMethod("javax.crypto.spec.IvParameterSpec", "$init", ["[B"],
        function(args) {
            const iv = args[0];
            console.log("[IvParameterSpec] IV length: " + iv.length);
            if (iv.length <= 16) {
                console.log("  IV: " + bytesToHex(iv));
            }
        },
        function(args, ret) {}
    );
}

// ================================================================================
// HOOK 8: WEBVIEW / URL LOADING (QR, Términos, Apertura)
// ================================================================================

function hookWebView() {
    console.log("[*] Hooking WebView...");
    
    hookMethod("android.webkit.WebView", "loadUrl", ["java.lang.String"],
        function(args) {
            console.log("[WebView.loadUrl] " + args[0]);
        },
        function(args, ret) {}
    );
    
    hookMethod("android.webkit.WebViewClient", "shouldOverrideUrlLoading", 
        ["android.webkit.WebView", "java.lang.String"],
        function(args) {
            console.log("[WebViewClient.shouldOverrideUrlLoading] " + args[1]);
        },
        function(args, ret) {
            console.log("[WebViewClient.shouldOverrideUrlLoading] Result: " + ret);
        }
    );
    
    hookMethod("android.webkit.WebViewClient", "onPageFinished", 
        ["android.webkit.WebView", "java.lang.String"],
        function(args) {
            console.log("[WebViewClient.onPageFinished] " + args[1]);
        },
        function(args, ret) {}
    );
}

// ================================================================================
// INICIALIZACIÓN PRINCIPAL
// ================================================================================

Java.perform(() => {
    console.log("\n" + "=".repeat(60));
    console.log("INICIANDO HOOKS BDV DIGITAL");
    console.log("=".repeat(60) + "\n");
    
    // 1. Dio HTTP Client
    hookDio();
    
    // 2. Certificate Pinning
    hookCertificatePinning();
    
    // 3. OAuth / Tokens
    hookOAuth();
    
    // 4. MethodChannel (QR)
    hookMethodChannel();
    
    // 5. Clave Móvil
    hookClaveMovil();
    
    // 6. Crypto (AES)
    hookCrypto();
    
    // 7. WebView
    hookWebView();
    
    // 8. Funciones nativas Dart (esperar a que libapp.so cargue)
    setTimeout(hookDartFunctions, 2000);
    
    console.log("\n[*] Todos los hooks Java registrados. Esperando eventos...");
    console.log("[*] Usa la app normalmente. Los logs aparecerán aquí.\n");
});

// ================================================================================
// COMANDOS INTERACTIVOS (ejecutar desde CLI de Frida)
// ================================================================================

rpc.exports = {
    // Dumpear memoria buscando app-key
    dumpMemory: function() {
        const results = [];
        Process.enumerateRangesSync({protection: 'r--', coalesce: true}).forEach(range => {
            try {
                const data = Memory.readByteArray(range.base, range.size);
                const text = data.toString();
                if (text.includes("app-key") || text.includes("appkey")) {
                    const idx = text.indexOf("app-key");
                    results.push({
                        base: range.base.toString(),
                        size: range.size,
                        context: text.substring(Math.max(0, idx-100), idx+200)
                    });
                }
            } catch (e) {}
        });
        return results;
    },
    
    // Buscar strings en memoria
    findString: function(search) {
        const results = [];
        Process.enumerateRangesSync({protection: 'r--', coalesce: true}).forEach(range => {
            try {
                const data = Memory.readByteArray(range.base, range.size);
                const text = data.toString();
                let idx = text.indexOf(search);
                while (idx !== -1) {
                    results.push({
                        base: range.base.toString(),
                        offset: idx,
                        context: text.substring(Math.max(0, idx-50), idx+search.length+50)
                    });
                    idx = text.indexOf(search, idx + 1);
                }
            } catch (e) {}
        });
        return results;
    },
    
    // Listar módulos cargados
    listModules: function() {
        return Process.enumerateModulesSync().map(m => ({
            name: m.name,
            base: m.base.toString(),
            size: m.size,
            path: m.path
        }));
    },
    
    // Hook manual de función nativa
    hookNative: function(address, name) {
        hookNativeFunction(ptr(address), name);
        return "Hooked " + name + " @ " + address;
    }
};