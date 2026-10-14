#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ghidra Headless Script: Extraer componentes críticos de BDV Digital libapp.so
================================================================================
Ejecución:
  1. Instalar Ghidra 12.1.x → set GHIDRA_INSTALL_DIR
  2. cd $GHIDRA_INSTALL_DIR/support
  3. ./analyzeHeadless /tmp/ghidra_project BDV_Analysis -import "C:/Users/Osiris/AppData/Local/Temp/arm64_decoded/lib/arm64-v8a/libapp.so" -postScript "C:/Users/Osiris/Desktop/extract_bdv_critical.py" -scriptPath "C:/Users/Osiris/Desktop" -deleteProject

O en Windows:
  analyzeHeadless.bat C:\Temp\ghidra_project BDV_Analysis -import "C:\Users\Osiris\AppData\Local\Temp\arm64_decoded\lib\arm64-v8a\libapp.so" -postScript "C:\Users\Osiris\Desktop\extract_bdv_critical.py" -scriptPath "C:\Users\Osiris\Desktop" -deleteProject

Salida: C:/Users/Osiris/Desktop/bdv_critical_findings.json
"""

import json
import os
from ghidra.app.decompiler import DecompInterface
from ghidra.program.model.listing import FunctionIterator
from ghidra.program.model.symbol import SymbolType
from ghidra.program.model.mem import MemoryAccessException
from ghidra.util.task import ConsoleTaskMonitor

# Configuración
OUTPUT_FILE = r"C:/Users/Osiris/Desktop/bdv_critical_findings.json"
TARGET_FUNCTIONS = [
    "consultaReglaCompra",
    "ejecutar-microcompra",
    "consultarReglasEXRI",
    "getReglasByMonedaRetiro",
    "encodeQr7b",
    "decodeQr7b"
]
SEARCH_STRINGS = [
    "app-key", "appkey", "AppKey", "APP_KEY",
    "client_id", "client_secret", "clientId", "clientSecret",
    "bdvx-oauth-server", "oauth/token",
    "CertificatePinner", "TrustManager", "pin", "Pin",
    "SHA-256", "sha256", "SHA256",
    "HMAC", "hmac", "Hmac",
    "AD7552C821266C8255348F726EXEC859",
    "AZ7552C821266C8255348F726CAB9590",
    "AD7552C821266C8255348F726CAB2330",
    "AD7552C821266C8255348F726CAB9589",
    "SecureSocket_RegisterBadCertificateCallback",
    "X509Certificate"
]

findings = {
    "app_key": None,
    "oauth_client_id": None,
    "oauth_client_secret": None,
    "certificate_pins": [],
    "hmac_signing_logic": {},
    "target_functions": {},
    "related_strings": []
}

def get_decompiler():
    """Inicializar decompilador"""
    ifc = DecompInterface()
    ifc.openProgram(currentProgram)
    return ifc

def search_strings_in_memory():
    """Buscar strings en memoria (.rodata, .data, etc.)"""
    print("[*] Buscando strings en memoria...")
    mem = currentProgram.getMemory()
    blocks = mem.getBlocks()
    
    for block in blocks:
        if not block.isRead() or block.isExecute():
            continue
        try:
            data = block.getBytes(block.getStart(), block.getSize())
            text = data.decode('utf-8', errors='ignore')
            
            for search in SEARCH_STRINGS:
                idx = 0
                while True:
                    idx = text.find(search, idx)
                    if idx == -1:
                        break
                    # Extraer contexto (100 chars antes y después)
                    start = max(0, idx - 100)
                    end = min(len(text), idx + len(search) + 100)
                    context = text[start:end].replace('\x00', '').strip()
                    if context:
                        findings["related_strings"].append({
                            "search_term": search,
                            "address": str(block.getStart().add(idx)),
                            "context": context[:300]
                        })
                    idx += 1
        except Exception as e:
            print(f"[!] Error leyendo bloque {block.getName()}: {e}")

def find_function_by_name(name):
    """Buscar función por nombre (múltiples estrategias)"""
    # 1. Por símbolo exacto
    sym = currentProgram.getSymbolTable().getPrimarySymbol(name)
    if sym:
        return sym.getObject()
    
    # 2. Por nombre en FunctionManager
    fm = currentProgram.getFunctionManager()
    for func in fm.getFunctions(True):
        if name in func.getName():
            return func
    
    # 3. Buscar en strings referenciados
    listing = currentProgram.getListing()
    for defined_data in listing.getDefinedData(True):
        if defined_data.getDataType().getName() == "string":
            val = defined_data.getValue()
            if name in str(val):
                refs = defined_data.getReferenceIterator()
                for ref in refs:
                    func = getFunctionContaining(ref.getFromAddress())
                    if func:
                        return func
    return None

def decompile_function(func, ifc):
    """Decompilar función y retornar pseudo-C"""
    if not func:
        return None
    results = ifc.decompileFunction(func, 60, ConsoleTaskMonitor())
    if results and results.decompileCompleted():
        return results.getDecompiledFunction().getC()
    return None

def extract_strings_from_function(func):
    """Extraer todas las strings referenciadas en una función"""
    strings = []
    if not func:
        return strings
    listing = currentProgram.getListing()
    addr_set = func.getBody()
    for addr in addr_set:
        data = listing.getDataAt(addr)
        if data and data.getDataType().getName() == "string":
            val = str(data.getValue())
            if val and len(val) > 3:
                strings.append({"address": str(addr), "value": val})
    return strings

def analyze_target_functions(ifc):
    """Analizar funciones objetivo"""
    print("[*] Analizando funciones objetivo...")
    for fname in TARGET_FUNCTIONS:
        func = find_function_by_name(fname)
        if func:
            print(f"  [+] Encontrada: {fname} @ {func.getEntryPoint()}")
            pseudo = decompile_function(func, ifc)
            refs = extract_strings_from_function(func)
            findings["target_functions"][fname] = {
                "address": str(func.getEntryPoint()),
                "pseudocode": pseudo[:10000] if pseudo else None,
                "referenced_strings": refs[:50]
            }
        else:
            print(f"  [-] No encontrada: {fname}")
            findings["target_functions"][fname] = None

def search_oauth_strings():
    """Buscar client_id/client_secret cerca de strings OAuth"""
    print("[*] Buscando credenciales OAuth...")
    listing = currentProgram.getListing()
    for defined_data in listing.getDefinedData(True):
        if defined_data.getDataType().getName() == "string":
            val = str(defined_data.getValue())
            if "bdvx-oauth-server" in val or "oauth/token" in val:
                addr = defined_data.getAddress()
                # Buscar referencias a esta string
                refs = list(defined_data.getReferenceIterator())
                for ref in refs:
                    func = getFunctionContaining(ref.getFromAddress())
                    if func:
                        pseudo = decompile_function(func, ifc)
                        if pseudo:
                            # Buscar patrones client_id/secret en pseudo-código
                            import re
                            for pattern in [r'client[_-]?id["\']?\s*[:=]\s*["\']([^"\']+)', 
                                           r'client[_-]?secret["\']?\s*[:=]\s*["\']([^"\']+)',
                                           r'client_id["\']?\s*[:=]\s*["\']([^"\']+)',
                                           r'client_secret["\']?\s*[:=]\s*["\']([^"\']+)']:
                                matches = re.findall(pattern, pseudo, re.IGNORECASE)
                                for m in matches:
                                    if "client_id" in pattern.lower() or "clientid" in pattern.lower():
                                        findings["oauth_client_id"] = m
                                    else:
                                        findings["oauth_client_secret"] = m

def search_app_key():
    """Buscar app-key en strings y referencias"""
    print("[*] Buscando app-key...")
    listing = currentProgram.getListing()
    for defined_data in listing.getDefinedData(True):
        if defined_data.getDataType().getName() == "string":
            val = str(defined_data.getValue())
            if any(k in val.lower() for k in ["app-key", "appkey", "app_key"]):
                # La string podría ser "app-key" o el valor mismo
                if len(val) > 10 and ":" not in val and "=" not in val:
                    findings["app_key"] = val
                    print(f"  [+] Posible app-key: {val}")
                # Buscar referencias
                refs = list(defined_data.getReferenceIterator())
                for ref in refs:
                    func = getFunctionContaining(ref.getFromAddress())
                    if func:
                        pseudo = decompile_function(func, ifc)
                        if pseudo:
                            import re
                            # Buscar asignación de app-key
                            matches = re.findall(r'app[_-]?key["\']?\s*[:=]\s*["\']([^"\']+)', pseudo, re.IGNORECASE)
                            for m in matches:
                                if len(m) > 5:
                                    findings["app_key"] = m
                                    print(f"  [+] app-key en código: {m}")

def search_certificate_pins():
    """Buscar pins SHA-256 de certificate pinning"""
    print("[*] Buscando certificate pins...")
    listing = currentProgram.getListing()
    for defined_data in listing.getDefinedData(True):
        if defined_data.getDataType().getName() == "string":
            val = str(defined_data.getValue())
            # Buscar hashes SHA-256 (64 hex chars) o referencias a pinning
            if len(val) == 64 and all(c in '0123456789abcdefABCDEF' for c in val):
                findings["certificate_pins"].append({
                    "pin": val.lower(),
                    "address": str(defined_data.getAddress()),
                    "context": "SHA-256 hash encontrado en string"
                })
            if any(k in val for k in ["CertificatePinner", "TrustManager", "pin", "Pin", "SHA-256", "sha256"]):
                refs = list(defined_data.getReferenceIterator())
                for ref in refs:
                    func = getFunctionContaining(ref.getFromAddress())
                    if func:
                        pseudo = decompile_function(func, ifc)
                        if pseudo:
                            import re
                            # Buscar arrays de pins
                            matches = re.findall(r'["\']([a-fA-F0-9]{64})["\']', pseudo)
                            for m in matches:
                                if m.lower() not in [p["pin"] for p in findings["certificate_pins"]]:
                                    findings["certificate_pins"].append({
                                        "pin": m.lower(),
                                        "address": str(func.getEntryPoint()),
                                        "context": "En array de pins en pseudo-código"
                                    })

def search_hmac_signing():
    """Buscar lógica HMAC/signing en funciones críticas"""
    print("[*] Buscando lógica HMAC/signing...")
    for fname, fdata in findings["target_functions"].items():
        if fdata and fdata["pseudocode"]:
            pseudo = fdata["pseudocode"]
            import re
            hmac_indicators = [
                r'HMAC', r'hmac', r'Hmac',
                r'SHA-?256', r'sha-?256',
                r'MessageDigest', r'Mac\.getInstance',
                r'SecretKeySpec', r'KeyGenerator',
                r'sign', r'verify', r'digest',
                r'X-BDV-Signature', r'X-Signature', r'Authorization.*HMAC',
                r'calculateSignature', r'generateSignature', r'computeHmac'
            ]
            for indicator in hmac_indicators:
                matches = list(re.finditer(indicator, pseudo, re.IGNORECASE))
                if matches:
                    for m in matches[:5]:
                        start = max(0, m.start() - 200)
                        end = min(len(pseudo), m.end() + 200)
                        context = pseudo[start:end]
                        if fname not in findings["hmac_signing_logic"]:
                            findings["hmac_signing_logic"][fname] = []
                        findings["hmac_signing_logic"][fname].append({
                            "indicator": indicator,
                            "context": context
                        })

# ================================================================================
# EJECUCIÓN PRINCIPAL
# ================================================================================
print("=" * 70)
print("Ghidra Script: Extraer componentes críticos BDV Digital libapp.so")
print("=" * 70)

ifc = get_decompiler()

# 1. Buscar strings en memoria
search_strings_in_memory()

# 2. Analizar funciones objetivo
analyze_target_functions(ifc)

# 3. Buscar credenciales OAuth
search_oauth_strings()

# 4. Buscar app-key
search_app_key()

# 5. Buscar certificate pins
search_certificate_pins()

# 6. Buscar lógica HMAC
search_hmac_signing()

# Guardar resultados
print(f"\n[*] Guardando resultados en {OUTPUT_FILE}...")
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(findings, f, indent=2, ensure_ascii=False)

print("[*] COMPLETADO")
print(json.dumps(findings, indent=2, ensure_ascii=False)[:2000])

# Cerrar decompilador
ifc.dispose()