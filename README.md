# PhotoBooth

Cabina de fotos para eventos. Es una **app de escritorio con Electron** (React + Vite + TypeScript) pensada para una PC con pantalla táctil vertical, una webcam y una impresora de fotos (DNP DS620A u otra).

> ⚠️ **No se puede publicar en Vercel ni en ningún hosting web.** La app necesita Electron para guardar la configuración, las fotos, los PDFs y para imprimir. En un navegador la pantalla se pone en blanco. Para usarla, se genera el instalador `.exe` y se instala en la PC de la cabina.

---

## 1. Requisitos

### Para desarrollar o generar el instalador
| Herramienta | Versión | Notas |
|---|---|---|
| Windows | 10 / 11 x64 | El instalador se genera para Windows x64 |
| [Node.js](https://nodejs.org/) | **24.x** (LTS) | Incluye npm 11 |
| [Git](https://git-scm.com/download/win) | cualquiera reciente | |
| Llave SSH en GitHub | — | Para clonar `git@github.com:Cardozo1w/photoboot-app.git` |
| Internet | — | La primera vez que generas el instalador se descargan Electron y NSIS (~150 MB) |

No hace falta instalar Python ni Visual Studio: el proyecto no usa módulos nativos.

### En la PC de la cabina (solo para usarla)
- Windows 10 / 11 x64
- Webcam USB (o la cámara integrada)
- Driver de la impresora instalado (si vas a imprimir). Si no, la app funciona en **modo PDF**.
- **No** necesita Node, Git ni internet.

---

## 2. Preparar el proyecto en otra computadora

```bash
git clone git@github.com:Cardozo1w/photoboot-app.git
cd photoboot-app
npm install
```

Si es una compu nueva y GitHub rechaza la conexión SSH, crea y registra una llave:

```bash
ssh-keygen -t ed25519 -C "tu-correo"
cat ~/.ssh/id_ed25519.pub   # copia esto en GitHub > Settings > SSH and GPG keys
ssh -T git@github.com       # debe decir "Hi Cardozo1w!"
```

---

## 3. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Abre la app en una **ventana normal** con DevTools y recarga en caliente. Úsalo para desarrollar. |
| `npm run dev:kiosk` | Igual pero en **modo kiosco** (pantalla completa, sin poder salir con el teclado). |
| `npm run build` | Revisa tipos y compila a `dist/` y `dist-electron/`. |
| `npm run dist` | Compila y genera el **instalador**: `release/PhotoBooth Setup 1.0.0.exe` |
| `npm run dist:dir` | Compila sin instalador; deja la app lista para correr en `release/win-unpacked/PhotoBooth.exe` (útil para probar rápido). |
| `npm run lint` | Linter (oxlint). |

Para cambiar la versión del instalador edita `"version"` en `package.json`.

---

## 4. Instalar en la PC de la cabina

1. En tu compu de desarrollo corre `npm run dist`.
2. Copia `release/PhotoBooth Setup 1.0.0.exe` a la PC de la cabina (USB, Drive, etc.).
3. Ejecútalo. Como el instalador **no está firmado**, Windows SmartScreen puede mostrar "Windows protegió su PC" → **Más información** → **Ejecutar de todas formas**.
4. Se crea un acceso directo **PhotoBooth** en el escritorio y en el menú Inicio.
5. La primera vez Windows puede pedir permiso para usar la cámara: acéptalo.

La app instalada abre en **modo kiosco** (pantalla completa). Alt+F4, Ctrl+W/Q/R, Esc, F11 y la tecla Windows están bloqueados a propósito.

### Abrir sin modo kiosco (para pruebas en la cabina)
En PowerShell:
```powershell
$env:PHOTOBOOTH_KIOSK="false"; & "$env:LOCALAPPDATA\Programs\PhotoBooth\PhotoBooth.exe"
```

---

## 5. Configuración (pantalla Admin)

1. Toca **5 veces seguidas la esquina superior izquierda** de la pantalla (en menos de 2.5 s).
2. Ingresa el PIN. **PIN por defecto: `1234`** (todavía no hay opción en la interfaz para cambiarlo).
3. Pestañas:
   - **Cámara**: elige la webcam y verifica la vista previa.
   - **Impresora / PDF**:
     - **Modo PDF** (por defecto): cada sesión se guarda como PDF en `Documentos\PhotoBooth\sesiones`.
     - **Impresora física**: elige la impresora de la lista y usa **Imprimir prueba** para verificar antes del evento. Si la impresión falla durante el evento, el invitado puede elegir "Guardar como PDF".
   - **Filtros**: corrección de color y nivel de retoque, con vista previa.
   - **Evento**: nombre del evento (sale al pie de la tira) y tema claro/oscuro.
4. **Salir** regresa a la cabina. **Cerrar aplicación** cierra el programa (es la única forma de cerrarla en modo kiosco).

### Impresora
- La app imprime **sin diálogo** a la impresora elegida, una hoja de **4×6"** con **dos tiras de 2×6"** iguales.
- **DNP DS620A**: instala el driver de DNP y en *Preferencias de impresión* de Windows pon como predeterminado el papel **6x4** con la opción de **corte a 2"** (2inch cut), para que la hoja salga ya cortada en dos tiras.
- Otras impresoras (p. ej. Epson de tinta): pon papel 4×6" (10×15 cm) como tamaño predeterminado en el driver y desactiva márgenes si el driver lo permite (sin bordes).
- Si la impresora seleccionada se desconecta, la app muestra el error "La impresora ... no está disponible".

---

## 6. Dónde guarda las cosas

| Qué | Ruta |
|---|---|
| Configuración (`config.json`) | `%APPDATA%\photobooth-app\config.json` |
| Logs (uno por día) | `%APPDATA%\photobooth-app\logs\AAAA-MM-DD.log` |
| Fotos y PDFs de sesiones | `Documentos\PhotoBooth\sesiones` |
| App instalada | `%LOCALAPPDATA%\Programs\PhotoBooth` |

Para volver a la configuración de fábrica, cierra la app y borra `config.json`.

---

## 7. Estructura del proyecto

```
electron/            Proceso principal de Electron (Node)
  main.ts            Ventana, modo kiosco, protocolo app://, IPC
  preload.ts         API window.photobooth expuesta al frontend
  store.ts           Config persistente (config.json)
  sessionStore.ts    Guarda las fotos de cada sesión
  printService/      PDF (pdfProvider) e impresora física (physicalProvider)
src/                 Frontend React
  state/             Máquina de estados de la cabina (XState)
  screens/           Pantallas: Idle, Captura, Selección, Proceso, Entrega, Admin
  filters/           Corrección de color y retoque de piel (MediaPipe)
public/mediapipe/    Modelo y wasm de MediaPipe (incluidos, no se descargan de internet)
release/             Salida del instalador (ignorada por git)
```

---

## 8. Problemas comunes

| Problema | Solución |
|---|---|
| Pantalla en blanco en el navegador / Vercel | Es normal: la app solo corre en Electron. Usa `npm run dev` o el instalador. |
| "Sin cámara detectada" | Revisa el cable USB, que ninguna otra app (Zoom, Teams, OBS) esté usando la cámara y los permisos de cámara de Windows. |
| No aparece la impresora | Instala el driver, enciéndela y pulsa **Actualizar lista** en Admin > Impresora. |
| La impresión sale con márgenes o mal tamaño | Ajusta el tamaño de papel predeterminado en las preferencias del driver (ver sección 5). |
| No puedo cerrar la app | Admin (5 toques arriba a la izquierda) → **Cerrar aplicación**. |
| `npm run dist` falla al descargar | Necesita internet la primera vez; vuelve a intentar. |
