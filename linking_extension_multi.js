(function(ext) {
  var ready = false;
  var device;
  var server;
  var services;
  var characteristics;
  var writeCharacteristic;
  var writeCharacteristic2;

  var button_state;
  var clicked = false;
  var double_clicked = false;
  var long_clicked = false;
  var long_released = false;

  var timerId = {};
  timerId["温度"] = 0;
  timerId["湿度"] = 0;

  var accel_x = 0
  var accel_y = 0
  var accel_z = 0

  const sensors = ["Sizuku 6X", "Sizuku THA", "Tomoru", "Pochiru", "Tukeru"];
  const SENSOR_ID_ACCELEROMETER = 0x01;
  const SENSOR_ID_TEMPERATURE = 0x04;
  const SENSOR_ID_HUMIDITY = 0x05;
  const SENSOR_ID_AIR_PRESSURE = 0x06;

  const SERVICE_ID_DEVICE_OPERATION = 0x02;
  const SERVICE_ID_DEVICE_SENSOR_INFORMATION = 0x03;

  const sensorNamePrefix = [
    "Sizuku_6x",
    "Sizuku_th",
    "Tomoru",
    "Pochiru",
    "Tukeru_th"
  ];

  const mask_sign = 0b00000000000000000000100000000000; // sign bit of temperature
  const mask_temp_exponent = 0b00000000000000000000011110000000; // exponentData of temperature
  const mask_temp_fixed_point = 0b00000000000000000000000001111111; // fixedPointData of temperature
  const mask_hum_exponent = 0b00000000000000000000111100000000; // exponentData of humidity
  const mask_hum_fixed_point = 0b00000000000000000000000011111111; // fixedPointData of humidity
  const mask_pre_exponent = 0b00000000000000000000111110000000; // exponentData of pressure
  const mask_pre_fixed_point = 0b00000000000000000000000001111111; // fixedPointData of pressure

  class SensorBaseClass {
    constructor() {
      this.isSensorOn = {};
      this.sensorIds = [];
      this.sensorNames = [];
      this.writeCharacteristic = null;
    }

    init() {
      let self = this;
      this.sensorIds.forEach(function(value, i) {
        self.isSensorOn[value.toString(10)] = false;
      });
    }

    setWriteCharacteristic(characteristic) {
      this.writeCharacteristic = characteristic;
    }

    ledOn() {
      let value = Uint8Array.of(
        0x01,
        0x04,
        0x08,
        0x00,
        0x01,
        0x07,
        0x01,
        0x00,
        0x00,
        0x01
      );
      this.writeCharacteristic.writeValue(value);
    }

    ledOff() {
      let value = Uint8Array.of(
        0x01,
        0x04,
        0x08,
        0x00,
        0x01,
        0x07,
        0x01,
        0x00,
        0x00,
        0x02
      );
      this.writeCharacteristic.writeValue(value);
    }
    getSensorStatus(sensorId) {
      return this.isSensorOn[sensorId.toString(10)];
    }
    sensorOn(sensorId) {
      this.isSensorOn[sensorId.toString(10)] = true;
    }
    sensorOff(sensorId) {
      this.isSensorOn[sensorId.toString(10)] = false;
    }
    characteristicValueChanged(value) {}
    getSensorValue() {}
  }

  function createSensorBaseClass(type) {
    let sensorBaseClass = null;
    switch (type) {
      case "Sizuku 6X":
        sensorBaseClass = new AccelerometerSensor();
        break;
      case "Tomoru":
        sensorBaseClass = new SensorBaseClass();
        break;
      case "Pochiru":
        sensorBaseClass = new ButtonSensor();
        break;
      case "Tukeru":
      case "Sizuku THA":
        sensorBaseClass = new THASensor();
        break;
    }

    return sensorBaseClass;
  }

  class THASensor extends SensorBaseClass {
    constructor() {
      super();
      this.temperature = -300;
      this.humidity = -1;
      this.airPressure = -300;
      this.sensorIds = [
        SENSOR_ID_TEMPERATURE,
        SENSOR_ID_HUMIDITY,
        SENSOR_ID_AIR_PRESSURE
      ];
      this.sensorNames = ["温度", "湿度", "気圧"];
      super.init();
    }

    characteristicValueChanged(value) {
      if (value.byteLength > 14) {
        let sensorData = (value.getUint8(15) << 8) + value.getUint8(14);
        // console.log("sensorData> 0x" + sensorData.toString(16));
        let sensorType = value.getUint8(9);
        if (sensorType == 4) {
          let signCode = (sensorData & mask_sign) === 0 ? 1 : -1;
          let exponentData = (sensorData & mask_temp_exponent) >>> 7;
          let fixedPointData = (sensorData & mask_temp_fixed_point) << 1;
          this.temperature =
            signCode *
            (1 + fixedPointData / 256) *
            Math.pow(2, exponentData - 7);
        } else if (sensorType == 5) {
          let exponentData = (sensorData & mask_hum_exponent) >>> 8;
          let fixedPointData = sensorData & mask_hum_fixed_point;
          this.humidity =
            (1 + fixedPointData / 256) * Math.pow(2, exponentData - 7);
        } else if (sensorType == 6) {
          let exponentData = (sensorData & mask_pre_exponent) >>> 7;
          let fixedPointData = (sensorData & mask_pre_fixed_point) << 1;
          this.airPressure =
            (1 + fixedPointData / 256) * Math.pow(2, exponentData - 15);
        }
      }
    }

    sensorOn(sensorId) {
      let value = Uint8Array.of(
        0x01,
        0x03,
        0x02,
        0x00,
        0x02,
        0x02,
        0x01,
        0x00,
        0x00,
        sensorId,
        0x03,
        0x01,
        0x00,
        0x00,
        0x01
      );
      this.writeCharacteristic.writeValue(value);
      super.sensorOn(sensorId);
    }

    sensorOff(sensorId) {
      let value = Uint8Array.of(
        0x01,
        0x03,
        0x02,
        0x00,
        0x02,
        0x02,
        0x01,
        0x00,
        0x00,
        sensorId,
        0x03,
        0x01,
        0x00,
        0x00,
        0x00
      );
      this.writeCharacteristic.writeValue(value);
      super.sensorOff(sensorId);
    }

    getSensorValue() {
      return [this.temperature, this.humidity, this.airPressure];
    }
  }

  class AccelerometerSensor extends SensorBaseClass {
    constructor() {
      super();
      this.x = -1000;
      this.y = -1000;
      this.z = -1000;
      this.sensorIds = [SENSOR_ID_ACCELEROMETER];
      this.sensorNames = ["加速度"];
      super.init();
    }

    characteristicValueChanged(value) {
      if (value.byteLength > 34) {
        // let sensorData = (value.getUint8(15) << 8) + value.getUint8(14);
        // console.log("sensorData> 0x" + sensorData.toString(16));
        let buffer = new ArrayBuffer(4);
        let bytes = new Uint8Array(buffer);
        let view = new DataView(buffer);
        bytes[0] = value.getUint8(17);
        bytes[1] = value.getUint8(16);
        bytes[2] = value.getUint8(15);
        bytes[3] = value.getUint8(14);
        this.x = view.getFloat32(0, false);
        accel_x = this.x;
        bytes[0] = value.getUint8(26);
        bytes[1] = value.getUint8(25);
        bytes[2] = value.getUint8(24);
        bytes[3] = value.getUint8(23);
        this.y = view.getFloat32(0, false);
        accel_y = this.y;
        bytes[0] = value.getUint8(34);
        bytes[1] = value.getUint8(33);
        bytes[2] = value.getUint8(32);
        bytes[3] = value.getUint8(31);
        this.z = view.getFloat32(0, false);
        accel_z = this.z;
        // console.log(" x:" + this.x + " y:" + this.y + " z:" + this.z);
      }
    }

    sensorOn(sensorId) {
      super.sensorOn(sensorId);
      let value = Uint8Array.of(
        0x01,
        0x03,
        0x02,
        0x00,
        0x02,
        0x02,
        0x01,
        0x00,
        0x00,
        0x01,
        0x03,
        0x01,
        0x00,
        0x00,
        0x01
      );
      this.writeCharacteristic.writeValue(value);
    }

    sensorOff(sensorId) {
      super.sensorOff(sensorId);
      let value = Uint8Array.of(
        0x01,
        0x03,
        0x02,
        0x00,
        0x02,
        0x02,
        0x01,
        0x00,
        0x00,
        0x01,
        0x03,
        0x01,
        0x00,
        0x00,
        0x00
      );
      this.writeCharacteristic.writeValue(value);
    }

    getSensorValue() {
      return [this.x, this.z, this.y];
    }
  }

  class ButtonSensor extends SensorBaseClass {
    constructor() {
      super();
    }

    characteristicValueChanged(value) {
      if (button_state == null) {
        clicked = true;
      } else {
        if (button_state == "クリックされた" && value.getUint8(9) == 2) {
          clicked = true;
        } else if (button_state == "ダブルクリックされた" && value.getUint8(9) == 4) {
          double_clicked = true;
        } else if (button_state == "長押しされた" && value.getUint8(9) == 7) {
          long_clicked = true;
        } else if (button_state == "長押しが離された" && value.getUint8(9) == 9) {
          long_released = true;
        }
      }
    }
  }

  class LinkingDevice {
    constructor(type) {
      this.device = null;
      this.server = null;
      this.services = null;
      this.type = type;
      this.previousRcvData = null;
      this.writeCharacteristic = null;
      this.writeCharacteristic2 = null;
      this.connected = false;
      this.disconnecting = false;
      this.prefix = sensorNamePrefix[sensors.indexOf(type)];
      this.SensorBaseClass = createSensorBaseClass(type);
      console.log("type:" + this.type);
    }

    async requestDevice(prefix) {
      try {
        let optionalServices = ["b3b36901-50d3-4044-808d-50835b13a6cd"];
        var self = this;
        this.device = await navigator.bluetooth.requestDevice({
          filters: [{ namePrefix: self.prefix }],
          optionalServices: optionalServices
        });
        this.device.addEventListener("gattserverdisconnected", function() {
          console.log("> Bluetooth Device disconnected:" + self.device.name);
          self.connected = false;
          if (!self.disconnecting && !self.connecting) {
            //自分から切断した場合、接続中以外は再接続
            self.connect();
          }
        });
        console.log("Connecting to GATT Server...");
        this.connect();
      } catch (error) {
        console.log("Argh! " + error);
      }
    }

    async connect() {
      this.connecting = true;
      var self = this;
      this.exponentialBackoff(
        3 /* max retries */,
        2 /* seconds delay */,
        async function toTry() {
          self.disconnecting = false;
          time("Connecting to Bluetooth Device... name:" + self.device.name);
          self.server = await self.device.gatt.connect({ bond: true });
          self.connecting = false;
          self.services = await self.server.getPrimaryServices();
          time("Service Discovered...");
          time("Start Notify");
          await self.startNotify(self.services);
          let _LinkingDevice = getDevice([self.type]);
          if (_LinkingDevice == null) {
            LinkingDeviceList.push(self);
          }
        },
        function success() {
          time("Connected... name:" + self.device.name);
        },
        function fail() {
          self.connected = false;
          self.connecting = false;
          time("Failed to connect.");
        }
      );
    }

    async exponentialBackoff(max, delay, toTry, success, fail) {
      var self = this;
      try {
        const result = await toTry();
        success(result);
      } catch (error) {
        console.log(error);
        if (max === 0) {
          return fail();
        }
        time("Retrying in " + delay + "s... (" + max + " tries left)");
        setTimeout(function() {
          self.exponentialBackoff(--max, delay * 2, toTry, success, fail);
        }, delay * 1000);
      }
    }

    async startNotify(services) {
      var self = this;
      for (const service of services) {
        console.log("> Service: " + service.uuid);
        characteristics = await service.getCharacteristics();
        characteristics.forEach(characteristic => {
          console.log(
            ">> Characteristic: " +
              characteristic.uuid +
              " " +
              getSupportedProperties(characteristic)
          );
          if (characteristic.uuid == "b3b39101-50d3-4044-808d-50835b13a6cd") {
            console.log(">> addEventListener: write");
            self.setWriteCharacteristic(characteristic);
          } else {
            console.log(">> addEventListener: indicate");
            self.writeCharacteristic2 = characteristic;
            const result = characteristic.startNotifications();
            console.log("> startNotifications result:" + result);

            {
              console.log("> Notifications started");
              self.connected = true;
              self.writeCharacteristic2.addEventListener(
                "characteristicvaluechanged",
                self.handleNotifications.bind(self)
              );
            }
          }
        });
      }
    }

    handleNotifications(event) {
      var sensorType = null;
      var sensorData = null;
      var value = event.target.value;
      let a = [];
      for (let i = 0; i < value.byteLength; i++) {
        a.push(
          "0x" + ("00" + value.getUint8(i).toString(16)).slice(-2)
        );
      }
      console.log("indicate> " + a.join(" "));
      if (value.getUint8(0) == 0x80) {
        //分割送信データをコピーしておく
        this.previousRcvData = new DataView(value.buffer);
        sensorType = this.previousRcvData.getUint8(9);
        return;
      } else if (value.getUint8(0) == 0x83) {
        sensorType = this.previousRcvData.getUint8(9);
        var merged = concatTypedArrays(
          new Uint8Array(
            this.previousRcvData.buffer || this.previousRcvData
          ),
          new Uint8Array(value.buffer || value)
        ).buffer;
        value = new DataView(merged);
      } else if (value.getUint8(0) == 0x81) {
        sensorType = value.getUint8(9);
      }
      this.SensorBaseClass.characteristicValueChanged(value);
    }

    setWriteCharacteristic(characteristic) {
      this.writeCharacteristic = characteristic;
      this.SensorBaseClass.setWriteCharacteristic(characteristic);
    }

    ledOn() {
      this.SensorBaseClass.ledOn();
    }

    ledOff() {
      this.SensorBaseClass.ledOff();
    }

    sensorOn(sensorId) {
      this.SensorBaseClass.sensorOn(sensorId);
    }

    sensorOff(sensorId) {
      this.SensorBaseClass.sensorOff(sensorId);
    }

    getSensorValue() {
      return this.SensorBaseClass.getSensorValue();
    }

    getSensorStatus(sensorId) {
      return this.SensorBaseClass.getSensorStatus(sensorId);
    }

    disconnect() {
      console.log("disconnectting...");
      if (
        this.device != null &&
        this.device.gatt != null &&
        this.device.gatt.connected
      ) {
        if (self.writeCharacteristic2 != null) {
          self.writeCharacteristic2.removeEventListener(
            "characteristicvaluechanged",
            this.handleNotifications
          )
        }
        this.disconnecting = true;
        this.device.gatt.disconnect();
      } else {
        console.log("> Bluetooth Device is already disconnected");
      }
    }
  }

  var LinkingDeviceList = [];

  function concatTypedArrays(a, b) {
    // a, b TypedArray of same type
    let c = new a.constructor(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
  }

  getSupportedProperties = function(characteristic) {
    let supportedProperties = [];
    for (const p in characteristic.properties) {
      if (characteristic.properties[p] === true) {
        supportedProperties.push(p.toUpperCase());
      }
    }
    return "[" + supportedProperties.join(", ") + "]";
  };

  ext._shutdown = function() {};

  ext._getStatus = function() {
    return { status: 2, msg: "Ready" };
  };

  function time(text) {
    console.log("[" + new Date().toJSON().substr(11, 8) + "] " + text);
  }

  ext.isButtonClicked = function(state) {
    button_state = state;
    if (clicked) {
      console.log("isButtonClicked");
      clicked = false;
      return true;
    }
    return false;
  };

  ext.whenButton = function(state) {
    button_state = state;
    let ret = false;
    switch (state) {
      case "クリックされた":
        if (clicked) {
          clicked = false;
          ret = true;
        }
        break;
      case "ダブルクリックされた":
        if (double_clicked) {
          double_clicked = false;
          ret = true;
        }
        break;
      case "長押しされた":
        if (long_clicked) {
          long_clicked = false;
          ret = true;
        }
        break;
      case "長押しが離された":
        if (long_released) {
          long_released = false;
          ret = true;
        }
        break;
    }
    if (ret) {
      console.log("whenButton clicked:" + state);
    }
    return ret;
  };

  ext.controlLED = function(type, val) {
    console.log("controlLED:" + val);
    let _linkingDevice = getDevice([type]);
    if (_linkingDevice == null) {
      return;
    }
    if (val == "on") {
      _linkingDevice.ledOn();
    } else {
      _linkingDevice.ledOff();
    }
  };

  function getTHA(tha, val, sensorId) {
    let value;
    // let deviceTypeArray = ["Sizuku THA", "Tukeru"];
    let deviceTypeArray = ["Sizuku THA"];
    let _linkingDevice = getDevice(deviceTypeArray);
    if (_linkingDevice == null) {
      return;
    }
    if (val == "on") {
      if (timerId[tha] != 0) {
        clearInterval(timerId[tha]);
        timerId[tha] = 0;
      }
      if (_linkingDevice.connected) {
        switch (sensorId) {
          case SENSOR_ID_TEMPERATURE:
            if (timerId["湿度"] != 0) {
              clearInterval(timerId["湿度"]);
            }
            _linkingDevice.sensorOff(SENSOR_ID_HUMIDITY);
            _linkingDevice.sensorOn(sensorId);
            break;
          case SENSOR_ID_HUMIDITY:
            if (timerId["温度"] != 0) {
              clearInterval(timerId["温度"]);
            }
            _linkingDevice.sensorOff(SENSOR_ID_TEMPERATURE);
            _linkingDevice.sensorOn(sensorId);
            break;
        }

        _linkingDevice.sensorOn(sensorId);
      }
      var Timer = function() {
        let _linkingDevice = getDevice(deviceTypeArray);
        if (_linkingDevice == null) {
          return;
        }
        if (_linkingDevice.connected) {
          _linkingDevice.sensorOn(sensorId);
        } else {
          if (!_linkingDevice.connecting) {
            _linkingDevice.connect();
          }
        }
      };
      if (timerId[tha] != 0) {
        clearInterval(timerId[tha]);
      }
      timerId[tha] = setInterval(Timer, 10000); //10秒に1回
    } else {
      //OFFにする
      if (timerId[tha] != 0) {
        clearInterval(timerId[tha]);
      }
      timerId[tha] = 0;
      if (_linkingDevice.connected) {
        _linkingDevice.sensorOff(sensorId);
      }
    }
  }

  ext.controlTemperature = function(val) {
    console.log("controlTemperature:" + val);
    getTHA("温度", val, SENSOR_ID_TEMPERATURE);
  };

  ext.controlHumidity = function(val) {
    console.log("controlHumidity:" + val);
    getTHA("湿度", val, SENSOR_ID_HUMIDITY);
  };

  getDevice = function(deviceTypeArray) {
    let _linkingDevice = null;
    for (let i = 0; i < LinkingDeviceList.length; i++) {
      for (let j = 0; j < deviceTypeArray.length; j++) {
        if (LinkingDeviceList[i].type == deviceTypeArray[j]) {
          _linkingDevice = LinkingDeviceList[i];
          break;
        }
      }
      if (_linkingDevice != null) {
        break;
      }
    }
    return _linkingDevice;
  };

  getDeviceConnectStatus = function(deviceType) {
    let _linkingDevice = getDevice([deviceType]);
    if (_linkingDevice != null) {
      return _linkingDevice.connected ? "ON" : "OFF";
    } else {
      return "OFF";
    }
  };

  ext.getDeviceStatusSizuku6X = function() {
    return getDeviceConnectStatus("Sizuku 6X");
  };

  ext.getDeviceStatusSizukuTHA = function() {
    return getDeviceConnectStatus("Sizuku THA");
  };

  ext.getDeviceStatusTomoru = function() {
    return getDeviceConnectStatus("Tomoru");
  };

  ext.getDeviceStatusPochiru = function() {
    return getDeviceConnectStatus("Pochiru");
  };

  ext.getDeviceStatusTukeru = function() {
    return getDeviceConnectStatus("Tukeru");
  };

  getSensorStatus = function(deviceTypeArray, sensorId) {
    let _linkingDevice = getDevice(deviceTypeArray);
    if (_linkingDevice != null) {
      return _linkingDevice.getSensorStatus(sensorId) ? "ON" : "OFF";
    } else {
      return "OFF";
    }
  };

  ext.getSensorStatusSizuku6X = function() {
    return getSensorStatus(["Sizuku 6X"], SENSOR_ID_ACCELEROMETER);
  };

  ext.getSensorStatusSizukuTHA_T = function() {
    return getSensorStatus(["Sizuku THA"], SENSOR_ID_TEMPERATURE);
  };

  ext.getSensorStatusSizukuTHA_H = function() {
    return getSensorStatus(["Sizuku THA"], SENSOR_ID_HUMIDITY);
  };

  ext.getSensorStatusTukeru_T = function() {
    return getSensorStatus(["Tukeru"], SENSOR_ID_TEMPERATURE);
  };

  ext.getSensorStatusTukeru_H = function() {
    return getSensorStatus(["Tukeru"], SENSOR_ID_HUMIDITY);
  };

  ext.getTemperature = function() {
    // let _linkingDevice = getDevice(["Sizuku THA", "Tukeru"]);
    let _linkingDevice = getDevice(["Sizuku THA"]);
    if (_linkingDevice == null) {
      return false;
    }
    data = _linkingDevice.getSensorValue();
    if (data[0] == -300) {
      return false;
    }
    return data[0];
  };

  ext.getHumidity = function() {
    // let _linkingDevice = getDevice(["Sizuku THA", "Tukeru"]);
    let _linkingDevice = getDevice(["Sizuku THA"]);
    if (_linkingDevice == null) {
      return false;
    }
    data = _linkingDevice.getSensorValue();
    if (data[1] == -1) {
      return false;
    }
    return data[1];
  };

  ext.getAclX = function() {
    try {
      let _linkingDevice = getDevice(["Sizuku 6X"]);
      if (_linkingDevice == null) {
        return false;
      }
      return accel_x;
    } catch (e) {
      console.log(e);
      return false;
    }
  };

  ext.getAclY = function() {
    try {
      let _linkingDevice = getDevice(["Sizuku 6X"]);
      if (_linkingDevice == null) {
        return false;
      }
      return accel_y;
    } catch (e) {
      console.log(e);
      return false;
    }
  };

  ext.getAclZ = function() {
    try {
      let _linkingDevice = getDevice(["Sizuku 6X"]);
      if (_linkingDevice == null) {
        return false;
      }
      return accel_z;
    } catch (e) {
      console.log(e);
      return false;
    }
  };

  ext.controlACL = function(val) {
    console.log("controlACL:" + val);
    type = "Sizuku 6X";
    let _linkingDevice = getDevice(["Sizuku 6X"]);
    if (val == "on") {
      _linkingDevice.sensorOn(SENSOR_ID_ACCELEROMETER);
    } else {
      _linkingDevice.sensorOff(SENSOR_ID_ACCELEROMETER);
    }
  };

  ext.controlConnect = async function(type, val) {
    console.log("controlConnect:type:" + type + " val:" + val);
    let value;
    if (val == "接続") {
      try {
        for (var i = 0; i < LinkingDeviceList.length; i++) {
          if (LinkingDeviceList[i].type == type) {
            console.log("Already connected. renew.");
            LinkingDeviceList[i].disconnect();
            LinkingDeviceList.splice(i, 1);
            break;
          }
        }
        var _LinkingDevice = new LinkingDevice(type);
        await _LinkingDevice.requestDevice();
      } catch (error) {
        console.log("Argh! " + error);
      }
    } else {
      var _linkingDevice = null;
      for (var i = 0; i < LinkingDeviceList.length; i++) {
        if (LinkingDeviceList[i].type == type) {
          _linkingDevice = LinkingDeviceList[i];
          break;
        }
      }
      if (_linkingDevice == null) {
        return;
      }
      _linkingDevice.disconnect();
      LinkingDeviceList.splice(i, 1);
    }
  };

  var descriptor = {
    menus: {
      btnStates: ["クリックされた", "ダブルクリックされた", "長押しされた", "長押しが離された"],
      outputs: ["on", "off"],
      connects: ["接続", "切断"],
      // sensors: ["Sizuku 6X", "Sizuku THA", "Tomoru", "Pochiru", "Tukeru"],
      sensors: ["Sizuku 6X", "Sizuku THA", "Tomoru", "Pochiru"],
      accels: ["加速度1", "加速度2"]
    },
    blocks: [
      [" ", "%m.sensors と %m.connects する", "controlConnect", "Sizuku 6X", "接続"],
      ["r", "Sizuku 6X デバイス状態", "getDeviceStatusSizuku6X"],
      ["r", "Sizuku THA デバイス状態", "getDeviceStatusSizukuTHA"],
      ["r", "Tomoru デバイス状態", "getDeviceStatusTomoru"],
      ["r", "Pochiru デバイス状態", "getDeviceStatusPochiru"],
      // ["r", "Tukeru デバイス状態", "getDeviceStatusTukeru"],
      ["r", "Sizuku 6X 加速度取得状態", "getSensorStatusSizuku6X"],
      ["r", "Sizuku THA 温度取得状態", "getSensorStatusSizukuTHA_T"],
      ["r", "Sizuku THA 湿度取得状態", "getSensorStatusSizukuTHA_H"],
      // ["r", "Tukeru 温度取得状態", "getSensorStatusTukeru_T"],
      // ["r", "Tukeru 湿度取得状態", "getSensorStatusTukeru_H"],
      ["r", "温度", "getTemperature"],
      ["r", "湿度", "getHumidity"],
      ["r", "加速度 x", "getAclX"],
      ["r", "加速度 y", "getAclY"],
      ["r", "加速度 z", "getAclZ"],
      ["h", "Pochiru が %m.btnStates とき", "whenButton", "クリックされた"],
      ["b", "Pochiru が %m.btnStates", "isButtonClicked", "クリックされた"],
      [" ", "%m.sensors のLEDを %m.outputs にする", "controlLED", "Sizuku 6X", "on"],
      [" ", "温度を %m.outputs にする", "controlTemperature", "on"],
      [" ", "湿度を %m.outputs にする", "controlHumidity", "on"],
      [" ", "加速度を %m.outputs にする", "controlACL", "on"]
    ]
  };

  //ブロックを登録
  ScratchExtensions.register("Linking Extension", descriptor, ext);
})({});

