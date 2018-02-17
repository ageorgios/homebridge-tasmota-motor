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
    this.sonoffhostname = config["hostname"];
    this.durationUp = config["secondsUp"];
    this.durationDown = config["secondsDown"];

    this.lastPosition = 0; // Last known position, (0-100%)
    this.currentPositionState = 2; // 2 = Stopped , 1=Moving Up , 0=Moving Down.
    this.currentTargetPosition = 0; //  Target Position, (0-100%)
    
    this.infoService = new Service.AccessoryInformation();
    this.infoService
        .setCharacteristic(Characteristic.Manufacturer, "Rade Bebek")
        .setCharacteristic(Characteristic.Model, "RaspberryPi SonOff Blinds")
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
    }else
    {
         duration = (this.currentTargetPosition - this.lastPosition) / 100 ;
    }
  } else {
    if(this.currentTargetPosition==0){
         duration = (this.lastPosition-this.currentTargetPosition) / 100;
    }else
    {
         duration = (this.lastPosition-this.currentTargetPosition) / 100;
    }  
  }

  this.log("Duration: %s ms", duration);
  this.log(move ? "Moving up" : "Moving down");
  this.service.setCharacteristic(Characteristic.PositionState, (move ? 1 : 0));
  this.currentPositionState = (move ? 1 : 0);
  
  this.httpRequest(move, duration);
  this.currentPositionState = 2;
  this.service.setCharacteristic(Characteristic.PositionState, 2);
  this.service.setCharacteristic(Characteristic.CurrentPosition, this.currentTargetPosition);
  this.lastPosition = this.currentTargetPosition;
  this.log("Successfully moved to target position: %s", this.currentTargetPosition);
  callback();

  return true;
}

TasmotaMotor.prototype.httpRequest = function(move, duration, callback){
  var url, pulsetime
  if (duration < 12) duration = duration * 10; else duration = duration + 100
  if (move) {
      if (this.durationUp < 12) pulsetime = this.durationUp * 10; else pulsetime = this.durationUp + 100
  }
  else {
      if (this.durationDown < 12) pulsetime = this.durationDown * 10; else pulsetime = this.durationDown + 100
  }
  url = 'http://' + this.sonoffhostname + '/cm?cmnd=backlog%20pulsetime'+move+'%20'+duration+';power'+move+'%20on;delay%20'+duration+';pulsetime%20'+pulsetime
  this.log("Sonoff link for moving blinds:  " + url);                    
  request.get({
  url: url,
  }, function(err, response, body) {
          if (!err && response.statusCode == 200) {
 		return;
          } else {
                  this.log("Error getting state (status code %s): %s", response.statusCode, err);
                  return;
          }
  }.bind(this));
}

TasmotaMotor.prototype.getServices = function() {
  return [this.infoService, this.service];
}