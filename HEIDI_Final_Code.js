// 
// Assist HEIDI – Puck.js firmware (FINAL VERSION)
//

const DEBUG = 0;

// 
// Modules
//
var HID = require("ble_hid_combo");
var eddystone = require("ble_eddystone");
var SWBtn = require("SWBtn");
var AHRS = require("https://inclusion-international.github.io/Wheely-Joystick-Mouse/src/Espruino/AHRS.js");

//
// For TAB key on the keyboard
//
if (!HID.KEY.Tab) {
  HID.KEY.Tab = 0x2B; // HID code for the Tab button
}

//
// Pins
//

//ORIGINAL
var pinTopBtn  = D31;
var pinSideBtn = D1;

//FOR TESTING
//var pinTopBtn  = D1;
//var pinSideBtn = D31;


pinMode(pinTopBtn,  "input_pullup");
pinMode(pinSideBtn, "input_pullup");

//
// Button: command mapping
//
var topBtnCommands = {
  //"S":  "CR",
  //"SS": "KP TAB",
  "S": "KP TAB",
  "L":  "CAL"
};

var sideBtnCommands = {
  "S": "CL",
  "L": "MOD"
};

//
// Persistent commands
//
var defaultStoreCommands = { "S":"AT CL", "SS":"AT CD", "L":"AT CR" };
var storeCommands = { "S":"", "SS":"", "L":"" };

function loadStoredCommands() {
  var stored = require("Storage").read("storeCommands");
  if (stored) storeCommands = JSON.parse(stored);
  else {
    require("Storage").write("storeCommands", JSON.stringify(defaultStoreCommands));
    loadStoredCommands();
  }
}

function storeCommand(cmd, type) {
  if (!["S","SS","L"].includes(type)) return;
  storeCommands[type] = String(cmd).trim();
  require("Storage").write("storeCommands", JSON.stringify(storeCommands));
}

//
// BLE service for configuration
//
NRF.setServices({
  0xBCDE: {
    0xABCD: {
      writable: true,
      onWrite: function (evt) {
        let s = "";
        new Uint8Array(evt.data).forEach(c => s += String.fromCharCode(c));
        s = s.trim();
        if (!s.includes(":")) return;
        let [type, cmd] = s.split(":").map(x => x.trim());
        storeCommand(cmd, type);
      }
    }
  }
}, { hid: HID.report, advertise: [0xBCDE] });

NRF.setAdvertising([
  {},
  [2,1,6, 3,3,0x12,0x18, 3,0x19,0xc0,0x03],
  [eddystone.get("https://l1nq.com/jtNjc")]
]);

//
// HID helpers
//
function moveMouseAction(x, y, b) { try { HID.moveMouse(x,y,b); } catch(e){} }
function clickButtonAction(b) { try { HID.clickButton(b); } catch(e){} }
function tapKeyAction(k) { try { HID.tapKey(k); } catch(e){} }
function holdKeyAction(k) { try { HID.keyDown(k); } catch(e){} }
function releaseKeyAction(k) { try { HID.keyUp(k); } catch(e){} }

//
// Direct action executor (for physical buttons)
//
function executeAction(action) {
  if (!action) return;

  if (action === "CL") clickButtonAction(HID.BUTTON.LEFT);
  else if (action === "CR") clickButtonAction(HID.BUTTON.RIGHT);
  else if (action === "CM") clickButtonAction(HID.BUTTON.MIDDLE);
  else if (action === "CD") {
    clickButtonAction(HID.BUTTON.LEFT);
    setTimeout(() => clickButtonAction(HID.BUTTON.LEFT), 100);
  }
  else if (action.startsWith("KP ")) {
    let key = action.slice(3);
    if (key.toUpperCase() === "TAB") {
      tapKeyAction(0x2B); // HID Tab code
    } else if (HID.KEY[key]) {
      tapKeyAction(HID.KEY[key]);
    }
  }
  else if (action === "MOD") changeMode();
  else if (action === "CAL") calibrateMouse();
}

//
// Buttons
//
var sideBtn = new SWBtn(k => executeAction(sideBtnCommands[k]), pinSideBtn);
var topBtn  = new SWBtn(k => executeAction(topBtnCommands[k]),  pinTopBtn);

//
// Modes
//
const InputMode = { MOUSE:0, MOVEMENT:1 };
var currentMode = InputMode.MOUSE;

function changeMode() {

  // Always release all the directional keys
  releaseKeyAction(HID.KEY.W);
  releaseKeyAction(HID.KEY.A);
  releaseKeyAction(HID.KEY.S);
  releaseKeyAction(HID.KEY.D);

  // Change modality
  currentMode = (currentMode === InputMode.MOUSE) ? InputMode.MOVEMENT : InputMode.MOUSE;
}

//
// AHRS (INIT ONCE)
//
var ahrsReady = false;
function initAHRS() {
  if (ahrsReady) return;
  AHRS.init();
  ahrsReady = true;
}

//
// Calibration + dead zone
//
var x_calib = 0;
var y_calib = 0;
const DEAD_ZONE = 15;

function calibrateMouse() {
  let o = AHRS.getOrientationDegree();
  x_calib = o.pitch;
  y_calib = o.roll;
}

//
// Tilt for mouse / WASD
//
function updateMouseMovementDegree(a) {
  let dx = a.pitch - x_calib;
  let dy = a.roll  - y_calib;

  if (Math.abs(dx) < DEAD_ZONE) dx = 0;
  if (Math.abs(dy) < DEAD_ZONE) dy = 0;

  if (currentMode === InputMode.MOUSE) {

    // Always release all the directional keys
    releaseKeyAction(HID.KEY.W);
    releaseKeyAction(HID.KEY.A);
    releaseKeyAction(HID.KEY.S);
    releaseKeyAction(HID.KEY.D);

    let x = dx ? (dx > 0 ? 20 : -20) : 0;
    let y = dy ? (dy > 0 ? 20 : -20) : 0;

    if (x || y) moveMouseAction(x, y, 0);
  }

  else { // MOVEMENT
    if (dy > 0) { releaseKeyAction(HID.KEY.W); holdKeyAction(HID.KEY.S); }
    else if (dy < 0) { releaseKeyAction(HID.KEY.S); holdKeyAction(HID.KEY.W); }
    else { releaseKeyAction(HID.KEY.W); releaseKeyAction(HID.KEY.S); }

    if (dx > 0) { releaseKeyAction(HID.KEY.A); holdKeyAction(HID.KEY.D); }
    else if (dx < 0) { releaseKeyAction(HID.KEY.D); holdKeyAction(HID.KEY.A); }
    else { releaseKeyAction(HID.KEY.A); releaseKeyAction(HID.KEY.D); }
  }
}

//
// Tilt polling
//
var tiltInterval;
const mouseMoveInterval = 50;

function startTilt() {
  if (tiltInterval) return;
  tiltInterval = setInterval(() => {
    let o = AHRS.getOrientationDegree();
    updateMouseMovementDegree(o);
  }, mouseMoveInterval);
}

function stopTilt() {
  if (tiltInterval) {
    clearInterval(tiltInterval);
    tiltInterval = undefined;
  }
}

//
// BLE events
//
NRF.on('connect', function () {
  initAHRS();
  startTilt();
  digitalPulse(LED2,1,300);
});

NRF.on('disconnect', function () {
  stopTilt();
  digitalPulse(LED3,1,300);
});

//
// Init
//
loadStoredCommands();
NRF.setConnectionInterval(100);
console.log("Puck.js ready (final version)");
