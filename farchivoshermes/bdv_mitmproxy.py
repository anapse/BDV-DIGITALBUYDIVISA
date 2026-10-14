#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mitmproxy Script: Capturar tráfico BDV Digital (bdvdigital.banvenez.com)
================================================================================
Uso:
  1. pip install mitmproxy
  2. mitmproxy -s C:/Users/Osiris/Desktop/bdv_mitmproxy.py
  3. Configurar proxy en Android: WiFi -> Proxy Manual -> IP PC:8080
  4. Instalar certificado CA: http://mitm.it -> Android -> instalar
  5. Abrir BDV Digital app y operar normalmente

Salida: Logs en consola + archivos JSON en C:/Users/Osiris/Desktop/bdv_captures/
"""

import json
import os
import re
from datetime import datetime
from mitmproxy import ctx, http
from mitmproxy.io import FlowWriter

# Configuración
CAPTURE_DIR = r"C:/Users/Osiris/Desktop/bdv_captures"
TARGET_HOSTS = [
    "bdvdigital.banvenez.com",
    "bdvenlinea.banvenez.com",
    "bdvenlinea.banvenez.com.ve"
]
TARGET_PATHS = [
    "/bdvx-oauth-server/oauth/token",
    "/bdvx-intervencion-cambiaria/v1/intervencion/consultarReglasEXRI",
    "/bdvx-operaciones-cambiarias/v1/operaciones/comprar",
    "/bdvx-operaciones-cambiarias/v1/operaciones/confirmar",
    "/bdvx-operaciones-cambiarias/v1/operaciones/consultar/reglas/compra",
    "/bdvx-operaciones-cambiarias/v1/operaciones/consultar/reglas",
    "/bdvx-operaciones-cambiarias/v1/operaciones/consultar/actividades",
    "/bdvx-operaciones-cambiarias/v1/operaciones/consultar/estados",
    "/bdvx-operaciones-cambiarias/v1/operaciones/consultar/oficinas",
    "/bdvx-operaciones-cambiarias/v1/operaciones/retiro",
    "/bdvx-operaciones-cambiarias/v1/operaciones/retiro/consulta-reglas",
    "/bdvx-operaciones-cambiarias/v1/operaciones/confirmar/retiro",
    "/bdvx-operaciones-cambiarias/v1/operaciones/vender",
    "/bdvx-menudeo-v2/v1/mercado",
    "/bdvx-menudeo-v2/v1/transar",
    "/bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2",
    "/bdvx-consulta-historico-operaciones/v1/operaciones/divisas",
    "/bdvx-verificacion-clavemovil/v1/apertura/solicitar-clavemovil",
    "/bdvx-verificacion-clavemovil/v1/apertura/confirmar-clavemovil",
    "/bdvx-estado-usuario/api/v2/estatus",
    "/bdvx-afiliacion-directorio/v1/bancos/all",
    "/bdvx-geolocalizacion/api/offices/all",
    "/bdvx-pagomovil-bdv-v2/v3/p2cbdv",
    "/bdvx-transferenciabdv-v2/v3/transferencias/terceros",
    "/bdvx-criptomoneda-v2/v1/comprar",
    "/bdvx-criptomoneda-v2/v1/tasa",
    "/bdvx-consultas-generales/v1/detalles-version",
    "/bdvx-pagomovil-obco-v2/v3/p2cobco",
    "/bdvx-proceso-inicial-apertura/v1/apertura/dato"
]

# Estado global
capture_count = 0
flow_writer = None

def load(loader):
    global flow_writer
    os.makedirs(CAPTURE_DIR, exist_ok=True)
    # Archivo de flujo para replay posterior
    flow_file = open(os.path.join(CAPTURE_DIR, f"bdv_flows_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mitm"), "wb")
    flow_writer = FlowWriter(flow_file)
    ctx.log.info(f"[BDV Capture] Directorio: {CAPTURE_DIR}")
    ctx.log.info(f"[BDV Capture] Hosts objetivo: {TARGET_HOSTS}")

def is_target_request(flow: http.HTTPFlow) -> bool:
    """Verificar si el request es de interés"""
    host = flow.request.pretty_host
    path = flow.request.path
    
    # Verificar host
    host_match = any(target in host for target in TARGET_HOSTS)
    if not host_match:
        return False
    
    # Verificar path (coincidencia parcial)
    path_match = any(target in path for target in TARGET_PATHS)
    return path_match

def sanitize_for_log(obj: dict) -> dict:
    """Eliminar/mascarar datos sensibles para logs"""
    if not isinstance(obj, dict):
        return obj
    
    sensitive_keys = [
        'password', 'Password', 'PASSWORD',
        'access_token', 'refresh_token', 'token', 'Token',
        'authorization', 'Authorization', 'AUTHORIZATION',
        'app-key', 'app_key', 'appkey', 'App-Key', 'APP-KEY',
        'client_id', 'client_secret', 'clientId', 'clientSecret',
        'codigoConfirmacion', 'otp', 'OTP', 'clave',
        'cedula', 'Cedula', 'CEDULA',
        'cuentaOrigenBs', 'cuentaDestinoDivisa', 'cuentaOrigen', 'cuentaDestino'
    ]
    
    result = {}
    for k, v in obj.items():
        if any(sk.lower() in k.lower() for sk in sensitive_keys):
            if isinstance(v, str) and len(v) > 4:
                result[k] = v[:4] + "*" * (len(v) - 8) + v[-4:] if len(v) > 8 else "****"
            else:
                result[k] = "****"
        elif isinstance(v, dict):
            result[k] = sanitize_for_log(v)
        elif isinstance(v, list):
            result[k] = [sanitize_for_log(item) if isinstance(item, dict) else item for item in v]
        else:
            result[k] = v
    return result

def save_capture(flow: http.HTTPFlow, label: str):
    """Guardar captura individual como JSON"""
    global capture_count
    capture_count += 1
    
    timestamp = datetime.now().isoformat()
    safe_host = flow.request.pretty_host.replace(".", "_")
    safe_path = flow.request.path.replace("/", "_").replace("?", "_")[:50]
    filename = f"{capture_count:04d}_{label}_{safe_host}{safe_path}_{timestamp.replace(':', '-')}.json"
    filepath = os.path.join(CAPTURE_DIR, filename)
    
    # Preparar datos
    request_data = {
        "method": flow.request.method,
        "url": flow.request.pretty_url,
        "host": flow.request.pretty_host,
        "path": flow.request.path,
        "headers": dict(flow.request.headers),
        "query": dict(flow.request.query),
        "content": flow.request.content.decode('utf-8', errors='ignore') if flow.request.content else None,
        "timestamp": timestamp
    }
    
    response_data = None
    if flow.response:
        response_data = {
            "status_code": flow.response.status_code,
            "reason": flow.response.reason,
            "headers": dict(flow.response.headers),
            "content": flow.response.content.decode('utf-8', errors='ignore') if flow.response.content else None,
            "timestamp": timestamp
        }
    
    capture = {
        "id": capture_count,
        "label": label,
        "timestamp": timestamp,
        "request": sanitize_for_log(request_data),
        "response": sanitize_for_log(response_data) if response_data else None
    }
    
    # Guardar JSON
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(capture, f, indent=2, ensure_ascii=False)
    
    # Log resumido
    ctx.log.info(f"[CAPTURE #{capture_count}] {flow.request.method} {flow.request.pretty_url}")
    if flow.response:
        ctx.log.info(f"  -> {flow.response.status_code} {flow.response.reason}")
    
    # Extraer y loggear datos críticos
    extract_critical_data(flow, capture)

def extract_critical_data(flow: http.HTTPFlow, capture: dict):
    """Extraer y destacar datos críticos"""
    req = capture["request"]
    resp = capture["response"]
    
    # 1. OAuth Token Request/Response
    if "/oauth/token" in req["path"]:
        ctx.log.info(f"  >>> OAUTH TOKEN REQUEST")
        ctx.log.info(f"     grant_type: {req['query'].get('grant_type')}")
        ctx.log.info(f"     username: {req['query'].get('username', '****')[:4]}****")
        if resp and resp["content"]:
            try:
                token_data = json.loads(resp["content"])
                ctx.log.info(f"  >>> OAUTH TOKEN RESPONSE")
                ctx.log.info(f"     access_token: {token_data.get('access_token', '')[:20]}...")
                ctx.log.info(f"     refresh_token: {token_data.get('refresh_token', '')[:20]}...")
                ctx.log.info(f"     expires_in: {token_data.get('expires_in')}")
                ctx.log.info(f"     token_type: {token_data.get('token_type')}")
            except:
                pass
    
    # 2. app-key header
    headers = req["headers"]
    for hk in ["app-key", "App-Key", "APP-KEY", "app_key", "appkey"]:
        if hk in headers:
            ctx.log.info(f"  >>> APP-KEY HEADER: {headers[hk]}")
    
    # 3. Authorization header
    for hk in ["Authorization", "authorization"]:
        if hk in headers:
            auth = headers[hk]
            ctx.log.info(f"  >>> AUTH HEADER: {auth[:50]}...")
    
    # 4. EXRI Response (consultarReglasEXRI)
    if "consultarReglasEXRI" in req["path"] and resp and resp["content"]:
        try:
            exri_data = json.loads(resp["content"])
            ctx.log.info(f"  >>> EXRI RESPONSE")
            if isinstance(exri_data, list):
                for rule in exri_data[:3]:
                    ctx.log.info(f"     Regla: {rule.get('codigoRegla')} | Tasa: {rule.get('tasaReferencia')} | Estado: {rule.get('estadoPolitica')} | Cupo: {rule.get('cupoPersNaturales')}")
            elif isinstance(exri_data, dict):
                ctx.log.info(f"     {json.dumps(exri_data, indent=2)[:500]}")
        except:
            pass
    
    # 5. Compra/Confirmar Response
    if any(x in req["path"] for x in ["/comprar", "/confirmar"]) and resp and resp["content"]:
        try:
            op_data = json.loads(resp["content"])
            ctx.log.info(f"  >>> OPERACION RESPONSE")
            ctx.log.info(f"     Status: {op_data.get('status') or op_data.get('codigoRespuesta') or op_data.get('code')}")
            ctx.log.info(f"     Message: {op_data.get('message') or op_data.get('descripcion')}")
            ctx.log.info(f"     OperacionId: {op_data.get('operacionId') or op_data.get('idOperacion')}")
            ctx.log.info(f"     Tasa: {op_data.get('tasaCambioCompra') or op_data.get('tasaCambio')}")
        except:
            pass
    
    # 6. Clave Móvil
    if "clavemovil" in req["path"] and resp and resp["content"]:
        try:
            cm_data = json.loads(resp["content"])
            ctx.log.info(f"  >>> CLAVE MOVIL RESPONSE")
            ctx.log.info(f"     {json.dumps(cm_data, indent=2)[:500]}")
        except:
            pass
    
    # 7. Menudeo
    if "menudeo" in req["path"] and resp and resp["content"]:
        try:
            men_data = json.loads(resp["content"])
            ctx.log.info(f"  >>> MENUDEO RESPONSE")
            ctx.log.info(f"     Compra: {men_data.get('tasaCambioCompraDolar')}")
            ctx.log.info(f"     Venta: {men_data.get('tasaCambioVentaDolar')}")
            ctx.log.info(f"     Estado: {men_data.get('estadoPolitica')}")
        except:
            pass

def request(flow: http.HTTPFlow):
    """Hook request"""
    if is_target_request(flow):
        save_capture(flow, "REQ")
        
        # También guardar en flujo mitmproxy
        if flow_writer:
            flow_writer.add(flow)

def response(flow: http.HTTPFlow):
    """Hook response"""
    if is_target_request(flow):
        save_capture(flow, "RESP")
        
        # Actualizar flujo mitmproxy
        if flow_writer:
            flow_writer.add(flow)

def error(flow: http.HTTPFlow):
    """Hook error"""
    if is_target_request(flow):
        ctx.log.error(f"[ERROR] {flow.request.pretty_url}: {flow.error}")

def done():
    """Limpieza al cerrar"""
    ctx.log.info(f"[BDV Capture] Total capturas: {capture_count}")
    ctx.log.info(f"[BDV Capture] Archivos en: {CAPTURE_DIR}")