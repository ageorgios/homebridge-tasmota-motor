var request = require('request');
var Service, Characteristic;

module.exports = function(homebridge){
        Service = homebridge.hap.Service;
        Characteristic = homebridge.hap.Characteristic;

        homebridge.registerAccessory('homebridge-tasmota-motor', 'TasmotaMotor', TasmotaMotor);
}

function TasmotaMotor(log, config){

    this.log = log; // log file
    this.name = config["name"]; 
    this.hostname = config["hostname"];
    this.durationUp = config["secondsUp"];
    this.durationDown = config["secondsDown"];

    this.lastPosition = 0; // Last known position, (0-100%)
    this.currentPositionState = 2; // 2 = Stopped , 1=Moving Up , 0=Moving Down.
    this.currentTargetPosition = 0; //  Target Position, (0-100%)
    
    this.infoService = new Service.AccessoryInformation();
    this.infoService
        .setCharacteristic(Characteristic.Manufacturer, "Sonoff")
        .setCharacteristic(Characteristic.Model, "Sonoff T1 Motor")
        .setCharacteristic(Characteristic.SerialNumber, "Version 1.0.0");
    
    this.service = new Service.WindowCovering(this.name);
    this.service
            .getCharacteristic(Characteristic.CurrentPosition)
            .on('get', this.getCurrentPosition.bind(this));
    this.service
            .getCharacteristic(Characteristic.PositionState)
            .on('get', this.getPositionState.bind(this));
    this.service
            .getCharacteristic(Characteristic.TargetPosition)
            .on('get', this.getTargetPosition.bind(this))
            .on('set', this.setTargetPosition.bind(this));
}

TasmotaMotor.prototype.getCurrentPosition = function(callback) {
    this.log("Requested CurrentPosition: %s", this.lastPosition);
    callback(null, this.lastPosition);
}

TasmotaMotor.prototype.getPositionState = function(callback) {
    this.log("Requested PositionState: %s", this.currentPositionState);
    callback(null, this.currentPositionState);
}

TasmotaMotor.prototype.getTargetPosition = function(callback) {
    this.log("Requested TargetPosition: %s", this.currentTargetPosition);
    callback(null, this.currentTargetPosition);
}

TasmotaMotor.prototype.setTargetPosition = function(pos, callback) {

  this.log("Setting target position to %s", pos);
  if (this.currentPositionState != 2) {
    this.log("Blinds are moving. You need to wait. I will do nothing.");
    callback();
    return false;
  }
  
  if (pos == 0 && this.currentPosition == 0) {
    this.currentPosition = 100
  }
  
  if (pos == 100 && this.currentPosition == 100) {
    this.currentPosition = 0
  }

  if (this.currentPosition == pos) {
    this.log("Current position already matches target position. There is nothing to do.");
    callback();
    return true;
  }

  this.currentTargetPosition = pos;
  var move = (this.currentTargetPosition > this.lastPosition);
  var duration;

  if (move) {
    if(this.lastPosition==0){
         duration = (this.currentTargetPosition - this.lastPosition) / 100 ;
    } else
    {
         duration = (this.currentTargetPosition - this.lastPosition) / 100 ;
    }
    duration = duration * this.durationUp
  } else {
    if(this.currentTargetPosition==0){
         duration = (this.lastPosition-this.currentTargetPosition) / 100;
    } else
    {
         duration = (this.lastPosition-this.currentTargetPosition) / 100;
    }  
    duration = duration * this.durationDown
  }

  this.log("Duration: %s s", duration.toFixed(1));

  var that = this
  var setFinalBlindsState = function() {
    that.currentPositionState = 2;
    that.service.setCharacteristic(Characteristic.PositionState, 2);
    that.service.setCharacteristic(Characteristic.CurrentPosition, that.currentTargetPosition);
    that.lastPosition = that.currentTargetPosition;
    that.log("Successfully moved to target position: %s", that.currentTargetPosition);
    callback();
  }
  
  this.httpRequest(move, duration, function(err) {
    if(err) return callback(err);
    that.log(move ? "Moving up" : "Moving down");
    that.service.setCharacteristic(Characteristic.PositionState, (move ? 1 : 0));
    that.currentPositionState = (move ? 1 : 0)
    setTimeout(setFinalBlindsState, duration*1000);    
  });

  return true;
}

TasmotaMotor.prototype.httpRequest = function(move, duration, callback){
  var url, pulsetime, delay = 2
  if (duration < 12) { 
    duration = duration * 10;
    if (duration > 2) delay = duration
  }
  else {
    delay = duration * 10
    duration = duration + 100
  }
  if (move) {
      if (this.durationUp < 12) pulsetime = this.durationUp * 10; else pulsetime = this.durationUp + 100
  }
  else {
      if (this.durationDown < 12) pulsetime = this.durationDown * 10; else pulsetime = this.durationDown + 100
  }
  var m = move ? 2 : 1
  url = 'http://' + this.hostname + '/cm?cmnd=backlog%20pulsetime'+m+'%20'+duration.toFixed(0)+';power'+m+'%20on;delay%20'+delay.toFixed(0)+';pulsetime'+m+'%20'+pulsetime.toFixed(0)
  this.log("Sonoff link for moving blinds:  " + url);                    
  request.get({ url: url,  }, function(err, response, body) {
    if (!err && response && response.statusCode == 200) {
    	return callback(null);
    } else {
      this.log("Error communicating to: " + url, err);
      return callback(err);
    }
  }.bind(this));
}

TasmotaMotor.prototype.getServices = function() {
  return [this.infoService, this.service];
}