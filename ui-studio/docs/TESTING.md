
# Protocolo de QA y Testing - ScanKey Pro

Guía de referencia para asegurar la calidad del sistema tanto en el frontend (Móvil/Web) como en el backend.

## 🤖 Pruebas Automatizadas (Scripts)

### 1. Validación de Contrato JSON
Asegura que las respuestas del motor de IA cumplan con el contrato de la app (3 resultados, ordenados, flags correctos).
```bash
# Probar con los samples incluidos
node scripts/contract_check.js scripts/sample_responses/high_confidence.json
node scripts/contract_check.js scripts/sample_responses/low_confidence.json
```

### 2. Auditoría de Secretos
Escanea el código en busca de llaves API, tokens o códigos de recuperación.
```bash
bash scripts/verify_no_secrets.sh
```

### 3. Smoke Test del Backend
Verifica que los endpoints vitales estén levantados y respondan correctamente.
```bash
bash scripts/smoke_test_backend.sh https://api.tu-servidor.com
```

---

## 📱 Checklist de Pruebas Manuales (UX/UI)

### Flujo Crítico de Análisis
- [ ] **Captura A/B:** Validar que se pueden tomar dos fotos y que el botón "Analizar" solo se habilita al tener ambas.
- [ ] **Loading:** Verificar que aparece "Intento 1/2" y el loader tipo Revolut.
- [ ] **Señales de Confianza:**
  - Si el resultado es > 0.95: Verificar banner verde y botón "Aceptar y duplicar".
  - Si el resultado es < 0.60: Verificar banner ámbar y que el sistema sugiere corrección manual.
- [ ] **Corrección Manual:** Abrir el modal, rellenar campos (Marca/Modelo) y verificar que al guardar se navega de vuelta a Home.

### Offline y Resiliencia
- [ ] **Modo Avión:** Realizar un feedback (seleccionar una llave). Verificar que no hay error visible (silent storage).
- [ ] **Sincronización:** Volver a estar online, ir a **Taller** y pulsar "Sincronizar Feedback". Verificar que la cola se vacía.
- [ ] **Detección de Red:** Verificar que en Home aparece el aviso "Sin conexión" al desconectar el Wi-Fi.

### Historial y Taller
- [ ] **Historial:** Navegar a la lista, buscar por marca. Abrir un resultado antiguo; debe cargar instantáneamente desde caché/memoria.
- [ ] **Taller:** Verificar que el contador de "Feedback en cola" es preciso.
- [ ] **Seguridad de PIN:** En el escaneo, pulsar el botón de candado, introducir `08800`. Debe saltar a la pantalla de corrección manual sin fotos.

### Compatibilidad Web
- [ ] **Cámara:** En navegadores sin permisos o sin cámara, verificar que se muestra el aviso "Cámara no disponible" sin crashear la app.
- [ ] **Galería:** Verificar que se pueden subir fotos desde el selector de archivos local.

---

## 🛠 Comandos de Acceso Rápido
Añadidos en `package.json`:
- `npm run qa:contract`: Valida el contrato básico.
- `npm run qa:secrets`: Busca fugas de información.
- `npm run qa:smoke`: Prueba de salud del backend.
- `npm run qa:all`: Ejecuta toda la suite de validación.
