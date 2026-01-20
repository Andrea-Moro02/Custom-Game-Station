/* =========================================================
   SWBtn – Software Button for Espruino / Puck.js
   Final Stable Version (input_pullup compatible)

   Support:
   - S  (short press)
   - SS (double short press)
   - L  (long press)

   Decision only at the RELEASE
   ========================================================= */

var SWBtn = function (callback, pin, disabled) {
  this.cb = callback || function(){};
  this.pin = pin || BTN1;

  this.watch = null;
  this.pressTime = 0;
  this.sequence = "";
  this.seqTimeout = null;

  if (!disabled) this.enable();
};

//
// Constant time configuration
//
SWBtn.prototype.CONF = {
  DEBOUNCE: 50,        // ms
  LONG_PRESS: 0.8,    // seconds (800 ms)
  SEQ_GAP: 450,       // ms (max time between S and S)
  CALLBACK_DELAY: 5   // ms
};

//
// ENABLE
//
SWBtn.prototype.enable = function () {
  if (this.watch) return;

  var self = this;
  this.sequence = "";

  this.watch = setWatch(
    function (e) { self._handleEdge(e); },
    this.pin,
    {
      repeat: true,
      edge: "both",
      debounce: this.CONF.DEBOUNCE
    }
  );
};

//
// DISABLE
//
SWBtn.prototype.disable = function () {
  if (this.watch) {
    clearWatch(this.watch);
    this.watch = null;
  }
  if (this.seqTimeout) {
    clearTimeout(this.seqTimeout);
    this.seqTimeout = null;
  }
  this.sequence = "";
};

//
// EDGE HANDLER (input_pullup)
//
SWBtn.prototype._handleEdge = function (e) {

  //
  // PRESS  (input_pullup: LOW = pressed)
  //
  if (e.state === false) {
    this.pressTime = e.time;
    return;
  }

  //
  // RELEASE (HIGH)
  //
  var duration = e.time - this.pressTime;
  var symbol = (duration >= this.CONF.LONG_PRESS) ? "L" : "S";

  // LONG PRESS
  if (symbol === "L") {
    this.sequence = "L";
    this._emitSequence();
    return;
  }

  // SHORT PRESS
  this.sequence += "S";

  // reset timeout sequence
  if (this.seqTimeout) clearTimeout(this.seqTimeout);

  var self = this;
  this.seqTimeout = setTimeout(function () {
    self._emitSequence();
  }, this.CONF.SEQ_GAP);
};

//
// SEQUENCE EMISSION
//
SWBtn.prototype._emitSequence = function () {
  if (this.seqTimeout) {
    clearTimeout(this.seqTimeout);
    this.seqTimeout = null;
  }

  var seq = this.sequence;
  this.sequence = "";

  // only valid patterns are allowed
  if (seq !== "S" && seq !== "SS" && seq !== "L") return;

  var self = this;
  setTimeout(function () {
    self.cb(seq);
  }, this.CONF.CALLBACK_DELAY);
};

// end
exports = SWBtn;
