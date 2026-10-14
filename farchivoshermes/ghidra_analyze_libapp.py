# Ghidra Headless Analysis Script for BDV Digital libapp.so
# Ejecutar: analyzeHeadless.bat "C:/Users/Osiris/ghidra_projects" "BDV_Analysis" -import "C:/Users/Osiris/AppData/Local/Temp/arm64_decoded/lib/arm64-v8a/libapp.so" -postScript "C:/Users/Osiris/Desktop/ghidra_analyze_libapp.py" -scriptPath "C:/Users/Osiris/Desktop" -deleteProject

from ghidra.app.decompiler import DecompInterface
from ghidra.util.task import ConsoleTaskMonitor
from ghidra.program.model.symbol import SourceType
from ghidra.program.model.mem import MemoryAccessException
import json

# Funciones críticas con offsets conocidos (del análisis de strings)
TARGET_FUNCTIONS = {
    "getReglasByMonedaRetiro": 0x55A15,      # offset 204327
    "consultaReglaCompra": 0x557BD,          # offset 349941
    "ejecutar_microcompra": 0x80D1C,         # offset 527652
    "consultarReglasEXRI": 0x86794,          # offset 550964
    "encodeQr7b": 0x72141,                   # offset 467505
    "decodeQr7b": 0x5D2BA,                   # offset 381810
    "suicheChannel": 0x61547,                # offset 398743
}

# Qué buscar en cada función
SEARCH_PATTERNS = {
    "app_key": ["app-key", "appkey", "AppKey", "APP_KEY"],
    "client_id": ["client_id", "clientId", "client-id", "clientid"],
    "client_secret": ["client_secret", "clientSecret", "client-secret", "clientsecret"],
    "hmac": ["HMAC", "hmac", "Hmac"],
    "sha256": ["SHA-256", "SHA256", "sha256"],
    "certificate_pins": ["pin", "Pin", "certificate", "CertificatePinner", "TrustManager", "X509Certificate"],
}

results = {
    "functions": {},
    "global_strings": {},
    "certificate_pins": [],
    "oauth_secrets": {},
}

def decompile_function(func):
    """Decompila una función y devuelve el pseudo-código"""
    decompiler = DecompInterface()
    decompiler.openProgram(currentProgram)
    result = decompiler.decompileFunction(func, 60, ConsoleTaskMonitor())
    if result and result.decompileCompleted():
        return result.getDecompiledFunction().getC()
    return None

def search_strings_in_decompiled(decompiled, patterns):
    """Busca patrones en código decompilado"""
    found = {}
    if not decompiled:
        return found
    
    decompiled_lower = decompiled.lower()
    for category, terms in patterns.items():
        matches = []
        for term in terms:
            term_lower = term.lower()
            idx = 0
            while True:
                idx = decompiled_lower.find(term_lower, idx)
                if idx == -1:
                    break
                # Extraer contexto
                start = max(0, idx - 300)
                end = min(len(decompiled), idx + 300)
                context = decompiled[start:end]
                matches.append({"term": term, "context": context})
                idx += len(term_lower)
        if matches:
            found[category] = matches
    return found

def get_function_at_or_create(offset, name):
    """Obtiene o crea una función en la dirección dada"""
    addr = toAddr(offset)
    func = getFunctionAt(addr)
    if not func:
        # Intentar crear función
        try:
            func = createFunction(addr, name)
        except:
            pass
    return func

def analyze_target_functions():
    """Analiza las funciones objetivo conocidas"""
    print("=== Analizando funciones objetivo ===")
    
    for name, offset in TARGET_FUNCTIONS.items():
        print(f"\n--- {name} @ 0x{offset:X} ---")
        func = get_function_at_or_create(offset, name)
        
        if func:
            decompiled = decompile_function(func)
            if decompiled:
                search_results = search_strings_in_decompiled(decompiled, SEARCH_PATTERNS)
                
                results["functions"][name] = {
                    "offset": offset,
                    "decompiled": decompiled,
                    "search_results": search_results,
                    "signature": str(func.getSignature()),
                }
                
                # Imprimir hallazgos clave
                for cat, matches in search_results.items():
                    for m in matches[:3]:  # Limitar a 3 matches por categoría
                        print(f"  [{cat}] {m['term']}: ...{m['context'][:200]}...")
                
                if not search_results:
                    print(f"  Sin hallazgos de patrones objetivo")
            else:
                print(f"  No se pudo decompilar")
                results["functions"][name] = {"offset": offset, "error": "decompile_failed"}
        else:
            print(f"  Función no encontrada/no creada en 0x{offset:X}")
            results["functions"][name] = {"offset": offset, "error": "not_found"}

def search_global_strings():
    """Busca strings globales en memoria"""
    print("\n=== Buscando strings globales ===")
    
    # Patrones a buscar en toda la memoria
    global_patterns = {
        "app_key": ["app-key", "appkey", "AppKey"],
        "client_id": ["client_id", "clientId"],
        "client_secret": ["client_secret", "clientSecret"],
        "oauth_endpoint": ["oauth/token", "grant_type"],
        "base_url": ["bdvdigital.banvenez.com"],
    }
    
    mem = currentProgram.getMemory()
    for block in mem.getBlocks():
        if block.isRead() and not block.isExecute() and block.getSize() > 1000:
            try:
                data = bytearray(block.getSize())
                mem.getBytes(block.getStart(), data)
                text = data.decode('utf-8', errors='ignore')
                
                for category, terms in global_patterns.items():
                    for term in terms:
                        idx = text.lower().find(term.lower())
                        if idx != -1:
                            start = max(0, idx - 200)
                            end = min(len(text), idx + 200)
                            context = text[start:end]
                            if category not in results["global_strings"]:
                                results["global_strings"][category] = []
                            results["global_strings"][category].append({
                                "term": term,
                                "block": block.getName(),
                                "offset": block.getStart().getOffset() + idx,
                                "context": context
                            })
                            print(f"  [{category}] {term} en {block.getName()}: ...{context[:150]}...")
            except MemoryAccessException:
                continue

def search_certificate_pins():
    """Busca pins de certificado (arrays de bytes SHA-256)"""
    print("\n=== Buscando certificate pins ===")
    
    # Buscar referencias a clases relacionadas con SSL pinning
    pin_classes = [
        "CertificatePinner",
        "TrustManager", 
        "X509TrustManager",
        "SSLContext",
        "SecureSocket",
    ]
    
    for cls_name in pin_classes:
        # Buscar en símbolos
        symbols = currentProgram.getSymbolTable().getSymbols(cls_name)
        for sym in symbols:
            print(f"  Símbolo {cls_name}: {sym.getAddress()}")
    
    # Buscar arrays de 32 bytes (SHA-256) en .rodata
    mem = currentProgram.getMemory()
    for block in mem.getBlocks():
        if block.isRead() and not block.isExecute() and block.getSize() > 1000:
            try:
                data = bytearray(block.getSize())
                mem.getBytes(block.getStart(), data)
                # Buscar patrones de 32 bytes repetidos (arrays de pins)
                # Buscar strings hex de 64 chars
                text = data.decode('utf-8', errors='ignore')
                import re
                hex64_matches = re.findall(r'[a-fA-F0-9]{64}', text)
                for match in hex64_matches:
                    if match not in [p['pin'] for p in results["certificate_pins"]]:
                        idx = text.find(match)
                        start = max(0, idx - 100)
                        end = min(len(text), idx + 100)
                        context = text[start:end]
                        results["certificate_pins"].append({
                            "pin": match,
                            "block": block.getName(),
                            "offset": block.getStart().getOffset() + idx,
                            "context": context
                        })
                        print(f"  PIN candidate: {match} en {block.getName()}")
            except MemoryAccessException:
                continue

def search_oauth_in_binary():
    """Busca OAuth client_id/secret en el binario"""
    print("\n=== Buscando OAuth secrets ===")
    
    mem = currentProgram.getMemory()
    for block in mem.getBlocks():
        if block.isRead() and not block.isExecute() and block.getSize() > 1000:
            try:
                data = bytearray(block.getSize())
                mem.getBytes(block.getStart(), data)
                text = data.decode('utf-8', errors='ignore')
                
                # Buscar client_id= o client_secret=
                import re
                for pattern in [r'client_id[=:]["\']?([^"\'\s&]{10,80})', r'client_secret[=:]["\']?([^"\'\s&]{10,80})']:
                    matches = re.findall(pattern, text, re.IGNORECASE)
                    for match in matches:
                        if match not in results["oauth_secrets"].get("client_id", []) and match not in results["oauth_secrets"].get("client_secret", []):
                            if "client_id" in pattern:
                                if "client_id" not in results["oauth_secrets"]:
                                    results["oauth_secrets"]["client_id"] = []
                                results["oauth_secrets"]["client_id"].append(match)
                                print(f"  client_id candidate: {match}")
                            else:
                                if "client_secret" not in results["oauth_secrets"]:
                                    results["oauth_secrets"]["client_secret"] = []
                                results["oauth_secrets"]["client_secret"].append(match)
                                print(f"  client_secret candidate: {match}")
            except MemoryAccessException:
                continue

def main():
    print("=== GHIDRA ANÁLISIS libapp.so (BDV Digital) ===")
    print(f"Programa: {currentProgram.getName()}")
    print(f"Arquitectura: {currentProgram.getLanguage().getProcessor().toString()}")
    
    analyze_target_functions()
    search_global_strings()
    search_certificate_pins()
    search_oauth_in_binary()
    
    # Guardar resultados
    output_path = "C:/Users/Osiris/Desktop/ghidra_analysis_results.json"
    with open(output_path, "w") as f:
        # No serializar el código decompilado completo (muy grande), solo hashes/resumen
        serializable = {
            "functions": {},
            "global_strings": results["global_strings"],
            "certificate_pins": results["certificate_pins"],
            "oauth_secrets": results["oauth_secrets"],
        }
        
        for name, data in results["functions"].items():
            if "decompiled" in data:
                serializable["functions"][name] = {
                    "offset": data["offset"],
                    "decompiled_length": len(data["decompiled"]),
                    "search_results": data.get("search_results", {}),
                    "signature": data.get("signature", ""),
                    "decompiled_preview": data["decompiled"][:2000] if data["decompiled"] else None,
                }
            else:
                serializable["functions"][name] = data
        
        json.dump(serializable, f, indent=2)
    
    print(f"\n=== ANÁLISIS COMPLETADO ===")
    print(f"Resultados guardados en {output_path}")

if __name__ == "__main__":
    main()