// Ghidra Headless Analysis Script for BDV Digital libapp.so
// Ejecutar: analyzeHeadless.bat "C:/Users/Osiris/ghidra_projects" "BDV_Analysis" -import "C:/Users/Osiris/AppData/Local/Temp/arm64_decoded/lib/arm64-v8a/libapp.so" -postScript "C:/Users/Osiris/Desktop/GhidraAnalyzeLibapp.java" -scriptPath "C:/Users/Osiris/Desktop" -deleteProject

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.mem.MemoryAccessException;
import ghidra.util.task.ConsoleTaskMonitor;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.*;
import java.util.regex.*;

public class GhidraAnalyzeLibapp extends GhidraScript {

    // Funciones críticas con offsets conocidos (del análisis de strings)
    private static final Map<String, Long> TARGET_FUNCTIONS = Map.of(
        "getReglasByMonedaRetiro", 0x55A15L,      // offset 204327
        "consultaReglaCompra", 0x557BDL,          // offset 349941
        "ejecutar_microcompra", 0x80D1CL,         // offset 527652
        "consultarReglasEXRI", 0x86794L,          // offset 550964
        "encodeQr7b", 0x72141L,                   // offset 467505
        "decodeQr7b", 0x5D2BAL,                   // offset 381810
        "suicheChannel", 0x61547L                 // offset 398743
    );

    // Patrones a buscar
    private static final Map<String, String[]> SEARCH_PATTERNS = Map.of(
        "app_key", new String[]{"app-key", "appkey", "AppKey", "APP_KEY"},
        "client_id", new String[]{"client_id", "clientId", "client-id", "clientid"},
        "client_secret", new String[]{"client_secret", "clientSecret", "client-secret", "clientsecret"},
        "hmac", new String[]{"HMAC", "hmac", "Hmac"},
        "sha256", new String[]{"SHA-256", "SHA256", "sha256"},
        "certificate_pins", new String[]{"pin", "Pin", "certificate", "CertificatePinner", "TrustManager", "X509Certificate"}
    );

    // Resultados
    private Map<String, Object> results = new HashMap<>();

    @Override
    protected void run() throws Exception {
        println("=== GHIDRA ANÁLISIS libapp.so (BDV Digital) ===");
        println("Programa: " + currentProgram.getName());
        println("Arquitectura: " + currentProgram.getLanguage().getProcessor().toString());

        // Estructura de resultados
        Map<String, Object> functions = new HashMap<>();
        Map<String, Object> globalStrings = new HashMap<>();
        List<Map<String, Object>> certificatePins = new ArrayList<>();
        Map<String, List<String>> oauthSecrets = new HashMap<>();

        results.put("functions", functions);
        results.put("global_strings", globalStrings);
        results.put("certificate_pins", certificatePins);
        results.put("oauth_secrets", oauthSecrets);

        // 1. Analizar funciones objetivo
        analyzeTargetFunctions(functions);

        // 2. Buscar strings globales
        searchGlobalStrings(globalStrings);

        // 3. Buscar certificate pins
        searchCertificatePins(certificatePins);

        // 4. Buscar OAuth secrets
        searchOAuthSecrets(oauthSecrets);

        // Guardar resultados
        writeResults();
        println("\n=== ANÁLISIS COMPLETADO ===");
        println("Resultados guardados en C:/Users/Osiris/Desktop/ghidra_analysis_results.json");
    }

    private void analyzeTargetFunctions(Map<String, Object> functions) {
        println("\n=== Analizando funciones objetivo ===");
        
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);

        for (Map.Entry<String, Long> entry : TARGET_FUNCTIONS.entrySet()) {
            String name = entry.getKey();
            long offset = entry.getValue();
            
            println("\n--- " + name + " @ 0x" + Long.toHexString(offset) + " ---");
            
            Address addr = toAddr(offset);
            Function func = getFunctionAt(addr);
            
            if (func == null) {
                // Intentar crear función
                try {
                    func = createFunction(addr, name);
                } catch (Exception e) {
                    // Ignorar
                }
            }
            
            if (func != null) {
                DecompileResults result = decompiler.decompileFunction(func, 60, new ConsoleTaskMonitor());
                if (result.decompileCompleted()) {
                    String decompiled = result.getDecompiledFunction().getC();
                    
                    Map<String, Object> funcResult = new HashMap<>();
                    funcResult.put("offset", offset);
                    funcResult.put("decompiled_length", decompiled.length());
                    funcResult.put("signature", func.getSignature().toString());
                    funcResult.put("decompiled_preview", decompiled.substring(0, Math.min(3000, decompiled.length())));
                    
                    // Buscar patrones
                    Map<String, List<Map<String, String>>> searchResults = searchInDecompiled(decompiled);
                    funcResult.put("search_results", searchResults);
                    
                    functions.put(name, funcResult);
                    
                    // Imprimir hallazgos
                    for (Map.Entry<String, List<Map<String, String>>> catEntry : searchResults.entrySet()) {
                        for (Map<String, String> match : catEntry.getValue()) {
                            println("  [" + catEntry.getKey() + "] " + match.get("term") + ": ..." + match.get("context").substring(0, Math.min(200, match.get("context").length())) + "...");
                        }
                    }
                    
                    if (searchResults.isEmpty()) {
                        println("  Sin hallazgos de patrones objetivo");
                    }
                } else {
                    println("  No se pudo decompilar: " + result.getErrorMessage());
                    Map<String, Object> errorResult = new HashMap<>();
                    errorResult.put("offset", offset);
                    errorResult.put("error", "decompile_failed: " + result.getErrorMessage());
                    functions.put(name, errorResult);
                }
            } else {
                println("  Función no encontrada/no creada en 0x" + Long.toHexString(offset));
                Map<String, Object> errorResult = new HashMap<>();
                errorResult.put("offset", offset);
                errorResult.put("error", "not_found");
                functions.put(name, errorResult);
            }
        }
    }

    private Map<String, List<Map<String, String>>> searchInDecompiled(String decompiled) {
        Map<String, List<Map<String, String>>> found = new HashMap<>();
        String decompiledLower = decompiled.toLowerCase();
        
        for (Map.Entry<String, String[]> catEntry : SEARCH_PATTERNS.entrySet()) {
            String category = catEntry.getKey();
            String[] terms = catEntry.getValue();
            
            List<Map<String, String>> matches = new ArrayList<>();
            for (String term : terms) {
                String termLower = term.toLowerCase();
                int idx = 0;
                while (true) {
                    idx = decompiledLower.indexOf(termLower, idx);
                    if (idx == -1) break;
                    
                    int start = Math.max(0, idx - 300);
                    int end = Math.min(decompiled.length(), idx + 300);
                    String context = decompiled.substring(start, end);
                    
                    Map<String, String> match = new HashMap<>();
                    match.put("term", term);
                    match.put("context", context);
                    matches.add(match);
                    
                    idx += termLower.length();
                    
                    if (matches.size() >= 5) break; // Limitar matches por término
                }
            }
            
            if (!matches.isEmpty()) {
                found.put(category, matches);
            }
        }
        
        return found;
    }

    private void searchGlobalStrings(Map<String, Object> globalStrings) {
        println("\n=== Buscando strings globales ===");
        
        Map<String, String[]> globalPatterns = Map.of(
            "app_key", new String[]{"app-key", "appkey", "AppKey"},
            "client_id", new String[]{"client_id", "clientId"},
            "client_secret", new String[]{"client_secret", "clientSecret"},
            "oauth_endpoint", new String[]{"oauth/token", "grant_type"},
            "base_url", new String[]{"bdvdigital.banvenez.com"}
        );
        
        Memory mem = currentProgram.getMemory();
        for (MemoryBlock block : mem.getBlocks()) {
            if (block.isRead() && !block.isExecute() && block.getSize() > 1000) {
                try {
                    byte[] data = new byte[(int) block.getSize()];
                    mem.getBytes(block.getStart(), data);
                    String text = new String(data, "UTF-8");
                    
                    for (Map.Entry<String, String[]> catEntry : globalPatterns.entrySet()) {
                        String category = catEntry.getKey();
                        String[] terms = catEntry.getValue();
                        
                        for (String term : terms) {
                            int idx = text.toLowerCase().indexOf(term.toLowerCase());
                            if (idx != -1) {
                                int start = Math.max(0, idx - 200);
                                int end = Math.min(text.length(), idx + 200);
                                String context = text.substring(start, end);
                                
                                List<Map<String, Object>> list = (List<Map<String, Object>>) globalStrings.get(category);
                                if (list == null) {
                                    list = new ArrayList<>();
                                    globalStrings.put(category, list);
                                }
                                
                                Map<String, Object> match = new HashMap<>();
                                match.put("term", term);
                                match.put("block", block.getName());
                                match.put("offset", block.getStart().getOffset() + idx);
                                match.put("context", context);
                                list.add(match);
                                
                                println("  [" + category + "] " + term + " en " + block.getName() + ": ..." + context.substring(0, Math.min(150, context.length())) + "...");
                            }
                        }
                    }
                } catch (MemoryAccessException e) {
                    // Ignorar
                }
            }
        }
    }

    private void searchCertificatePins(List<Map<String, Object>> certificatePins) {
        println("\n=== Buscando certificate pins ===");
        
        Memory mem = currentProgram.getMemory();
        Pattern hex64Pattern = Pattern.compile("[a-fA-F0-9]{64}");
        
        for (MemoryBlock block : mem.getBlocks()) {
            if (block.isRead() && !block.isExecute() && block.getSize() > 1000) {
                try {
                    byte[] data = new byte[(int) block.getSize()];
                    mem.getBytes(block.getStart(), data);
                    String text = new String(data, "UTF-8");
                    
                    Matcher matcher = hex64Pattern.matcher(text);
                    while (matcher.find()) {
                        String pin = matcher.group();
                        
                        // Verificar si ya existe
                        boolean exists = false;
                        for (Map<String, Object> p : certificatePins) {
                            if (pin.equals(p.get("pin"))) {
                                exists = true;
                                break;
                            }
                        }
                        
                        if (!exists) {
                            int idx = matcher.start();
                            int start = Math.max(0, idx - 100);
                            int end = Math.min(text.length(), idx + 100);
                            String context = text.substring(start, end);
                            
                            Map<String, Object> pinInfo = new HashMap<>();
                            pinInfo.put("pin", pin);
                            pinInfo.put("block", block.getName());
                            pinInfo.put("offset", block.getStart().getOffset() + idx);
                            pinInfo.put("context", context);
                            certificatePins.add(pinInfo);
                            
                            println("  PIN candidate: " + pin + " en " + block.getName());
                        }
                    }
                } catch (MemoryAccessException e) {
                    // Ignorar
                }
            }
        }
    }

    private void searchOAuthSecrets(Map<String, List<String>> oauthSecrets) {
        println("\n=== Buscando OAuth secrets ===");
        
        Memory mem = currentProgram.getMemory();
        Pattern clientIdPattern = Pattern.compile("client_id[=:][\"']?([^\"'\\s&]{10,80})", Pattern.CASE_INSENSITIVE);
        Pattern clientSecretPattern = Pattern.compile("client_secret[=:][\"']?([^\"'\\s&]{10,80})", Pattern.CASE_INSENSITIVE);
        
        for (MemoryBlock block : mem.getBlocks()) {
            if (block.isRead() && !block.isExecute() && block.getSize() > 1000) {
                try {
                    byte[] data = new byte[(int) block.getSize()];
                    mem.getBytes(block.getStart(), data);
                    String text = new String(data, "UTF-8");
                    
                    Matcher m1 = clientIdPattern.matcher(text);
                    while (m1.find()) {
                        String val = m1.group(1);
                        List<String> list = oauthSecrets.get("client_id");
                        if (list == null) {
                            list = new ArrayList<>();
                            oauthSecrets.put("client_id", list);
                        }
                        if (!list.contains(val)) {
                            list.add(val);
                            println("  client_id candidate: " + val);
                        }
                    }
                    
                    Matcher m2 = clientSecretPattern.matcher(text);
                    while (m2.find()) {
                        String val = m2.group(1);
                        List<String> list = oauthSecrets.get("client_secret");
                        if (list == null) {
                            list = new ArrayList<>();
                            oauthSecrets.put("client_secret", list);
                        }
                        if (!list.contains(val)) {
                            list.add(val);
                            println("  client_secret candidate: " + val);
                        }
                    }
                } catch (MemoryAccessException e) {
                    // Ignorar
                }
            }
        }
    }

    private void writeResults() throws Exception {
        PrintWriter out = new PrintWriter(new FileWriter("C:/Users/Osiris/Desktop/ghidra_analysis_results.json"));
        
        StringBuilder json = new StringBuilder();
        json.append("{\n");
        json.append("  \"functions\": ").append(mapToJson((Map) results.get("functions"))).append(",\n");
        json.append("  \"global_strings\": ").append(mapToJson((Map) results.get("global_strings"))).append(",\n");
        json.append("  \"certificate_pins\": ").append(listToJson((List) results.get("certificate_pins"))).append(",\n");
        json.append("  \"oauth_secrets\": ").append(mapToJson((Map) results.get("oauth_secrets"))).append("\n");
        json.append("}\n");
        
        out.write(json.toString());
        out.close();
    }

    private String mapToJson(Map map) {
        if (map == null || map.isEmpty()) return "{}";
        StringBuilder sb = new StringBuilder();
        sb.append("{\n");
        boolean first = true;
        for (Object key : map.keySet()) {
            if (!first) sb.append(",\n");
            first = false;
            sb.append("    \"").append(escapeJson(key.toString())).append("\": ");
            Object val = map.get(key);
            if (val instanceof Map) {
                sb.append(mapToJson((Map) val));
            } else if (val instanceof List) {
                sb.append(listToJson((List) val));
            } else if (val instanceof String) {
                sb.append("\"").append(escapeJson(val.toString())).append("\"");
            } else if (val instanceof Number) {
                sb.append(val.toString());
            } else {
                sb.append("\"").append(escapeJson(val.toString())).append("\"");
            }
        }
        sb.append("\n  }");
        return sb.toString();
    }

    private String listToJson(List list) {
        if (list == null || list.isEmpty()) return "[]";
        StringBuilder sb = new StringBuilder();
        sb.append("[\n");
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) sb.append(",\n");
            Object val = list.get(i);
            sb.append("    ");
            if (val instanceof Map) {
                sb.append(mapToJson((Map) val));
            } else if (val instanceof String) {
                sb.append("\"").append(escapeJson(val.toString())).append("\"");
            } else {
                sb.append(val.toString());
            }
        }
        sb.append("\n  ]");
        return sb.toString();
    }

    private String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }
}