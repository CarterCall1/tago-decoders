function decodeUplink(input) {
  var bytes = input.bytes;

  function calculateBatteryVoltage(byte) {
    return byte * 8 + 1600;
  }

  function calculateTemperature(rawData) {
    return rawData / 10.0;
  }

  function handleKeepalive(bytes, data) {
    // Byte 1: Device battery voltage
    var batteryVoltage = calculateBatteryVoltage(bytes[1]) / 1000;
    data.batteryVoltage = Number(batteryVoltage.toFixed(2));

    // Byte 2: Thermistor operational status and temperature data (bits 9:8)
    var thermistorConnected = (bytes[2] & 0x04) === 0; // Bit 2
    var temperatureHighBits = bytes[2] & 0x03; // Bits 1:0

    // Byte 3: Thermistor temperature data (bits 7:0)
    var temperatureLowBits = bytes[3];
    var temperatureRaw = (temperatureHighBits << 8) | temperatureLowBits;
    var temperatureCelsius = calculateTemperature(temperatureRaw);
    data.thermistorProperlyConnected = thermistorConnected;
    data.temperature = Number(temperatureCelsius.toFixed(1));

    // Byte 4-6: Counter data
    var counter = ((bytes[4] << 16) | (bytes[5] << 8) | bytes[6]);
    data.counter = counter;

    // Byte 7: Status or event code
    var status = parseInt(bytes[7] || '0', 16);
    data.status = status;

    return data;
  }

  function handleResponse(bytes, data) {
    var commands = bytes.map(function (byte) {
      return ("0" + byte.toString(16)).substr(-2);
    });

    commands = commands.slice(0, -8); // Adjust slice to avoid slicing too much data
    var command_len = 0;

    commands.forEach(function (command, i) {
      switch (command) {
        case '04':
          command_len = 2;
          var hardwareVersion = commands[i + 1];
          var softwareVersion = commands[i + 2];
          data.deviceVersions = { hardware: Number(hardwareVersion), software: Number(softwareVersion) };
          break;
        case '12':
          command_len = 1;
          data.keepAliveTime = parseInt(commands[i + 1], 16);
          break;
        case '19':
          command_len = 1;
          var commandResponse = parseInt(commands[i + 1], 16);
          var periodInMinutes = commandResponse * 5 / 60;
          data.joinRetryPeriod = periodInMinutes;
          break;
        case '1b':
          command_len = 1;
          data.uplinkType = parseInt(commands[i + 1], 16);
          break;
        case '1d':
          command_len = 2;
          var wdpC = commands[i + 1] === '00' ? false : parseInt(commands[i + 1], 16);
          var wdpUc = commands[i + 2] === '00' ? false : parseInt(commands[i + 2], 16);
          data.watchDogParams = { wdpC: wdpC, wdpUc: wdpUc };
          break;
        case '1f':
          command_len = 1;
          data.sendEventLater = parseInt(commands[i + 1], 16);
          break;
        default:
          break;
      }
      commands.splice(i, command_len);
    });
    return data;
  }

  var data = {};

  if (bytes[0] === 1) {
    data = handleKeepalive(bytes, data);
  } else {
    data = handleResponse(bytes, data);
    // Handle the remaining keepalive data if required after response
    bytes = bytes.slice(-8);
    data = handleKeepalive(bytes, data);
  }

  return data;
}

function hexToDecArr(hexData) {
  return hexData.match(/.{1,2}/g).map(function (byte) { return parseInt(byte, 16) })
}

function toTagoFormat(object_item, group, prefix = '', location_let) {
  const result = [];
  for (const key in object_item) {
    if (typeof object_item[key] === 'object') {
      result.push({
        variable: object_item[key].variable || `${prefix}${key}`,
        value: object_item[key].value,
        group: object_item[key].group || group,
        metadata: object_item[key].metadata,
        location: object_item[key].location || location_let,
        unit: object_item[key].unit,
      });
    } else {
      result.push({
        variable: `${prefix}${key}`,
        value: object_item[key],
        location: location_let,
        group,
      });
    }
  }

  return result;
}
// let payload = [{ variable: 'payload', value: '120501AB00D91B5CAE01', group: '' }];
// 01AB00D91B5CAE01
const data = payload.find(x => x.variable === 'data' || x.variable === 'payload');
if (data) {
  const group = String(data.group || Date.now());
  const lets_to_tago = decodeUplink({ bytes: hexToDecArr(data.value), port: 2 });
  payload = [...payload, ...toTagoFormat(lets_to_tago, group, '', lets_to_tago.location)];
}
