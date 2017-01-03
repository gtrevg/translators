'use strict';

// This code uses ES2015 syntax that requires at least Node.js v4.
// For Node.js ES2015 support details, reference http://node.green/

function validateArgumentType(arg, argName, expectedType) {
    if (typeof arg === 'undefined') {
        throw new Error('Missing argument: ' + argName + '. ' +
            'Expected type: ' + expectedType + '.');
    } else if (typeof arg !== expectedType) {
        throw new Error('Invalid argument: ' + argName + '. ' +
            'Expected type: ' + expectedType + ', got: ' + (typeof arg));
    }
}

var deviceHvacModeToTranslatorHvacModeMap = {
    'cool': 'coolOnly',
    'heat': 'heatOnly',
    'heat-cool': 'auto',
    'off': 'off'
}

var translatorHvacModeToDeviceHvacModeMap = {
    'coolOnly': 'cool',
    'heatOnly': 'heat',
    'auto': 'heat-cool',
    'off': 'off'
}

function deviceHvacModeToTranslatorHvacMode(mode) {
    return deviceHvacModeToTranslatorHvacModeMap[mode];
}

function translatorHvacModeToDeviceHvacMode(mode) {
    return translatorHvacModeToDeviceHvacModeMap[mode];
}

function readHvacMode(deviceSchema) {
    // Assume 'auto' and 'off' are always supported
    var supportedHvacModes = [
        'auto',
        'off'
    ];

    if (deviceSchema['can_cool']) {
        supportedHvacModes.push('coolOnly');
    }
    if (deviceSchema['can_heat']) {
        supportedHvacModes.push('heatOnly');
    }

    var hvacMode = deviceHvacModeToTranslatorHvacMode(deviceSchema['hvac_mode']);

    return {
        supportedModes: supportedHvacModes,
        modes: [hvacMode]
    };
}

function createResource(resourceType, accessLevel, id, expand, state) {
    var resource = {
        href: '/' + id,
        rt: [resourceType],
        if: [accessLevel, 'oic.if.baseline']
    }

    if (expand) {
        resource.id = id;
        Object.assign(resource, state);
    }

    return resource;
}

// Helper method to convert the device schema to the translator schema.
function deviceSchemaToTranslatorSchema(deviceSchema) {

    // Quirks:
    // - Nest does not have an external temperature field, so that is left out.
    // - Away Mode is not implemented at this time.

    // return units in Celsius regardless of what the thermostat is set to
    var tempScale = 'C';
    var ts = tempScale.toLowerCase();

    return {
        hvacMode: readHvacMode(deviceSchema),
    };
}

// Helper method to convert the provider schema to the platform schema.
function providerSchemaToPlatformSchema(providerSchema, expand) {

    // Quirks:
    // - Nest does not have an external temperature field, so that is left out.
    // - Away Mode is not implemented at this time.

    // Get temperature scale
    var ts = providerSchema['temperature_scale'].toLowerCase();

    var max = stateReader.get('max_set_point');
    var min = stateReader.get('min_set_point');
    var temperatureUnits = stateReader.get('units').temperature;

    var ambientTemperature = createResource('oic.r.temperature', 'oic.if.s', 'ambientTemperature', expand, {
        temperature: providerSchema['ambient_temperature_' + ts],
        units: ts //TODO: check scale
    });

    var targetTemperature = createResource('oic.r.temperature', 'oic.if.a', 'targetTemperature', expand, {
        temperature: providerSchema['target_temperature_' + ts],
        units: ts
    });

    var targetTemperatureHigh = createResource('oic.r.temperature', 'oic.if.a', 'targetTemperatureHigh', expand, {
        temperature: providerSchema['target_temperature_high_' + ts],
        units: ts
    });

    var targetTemperatureLow = createResource('oic.r.temperature', 'oic.if.a', 'targetTemperatureLow', expand, {
        temperature: providerSchema['target_temperature_low_' + ts],
        units: ts
    });

    //TODO: AWAY
    var awayMode = createResource('oic.r.mode', 'oic.if.a', 'awayMode', expand, {
        mode: stateReader.get('users_away') ? 'away' : 'home',
        supportedModes: ['home', 'away']
    });

    var ecoMode = createResource('oic.r.sensor', 'oic.if.s', 'ecoMode', expand, {
        value: providerSchema['has_leaf']
    });

    var hvacMode = createResource('oic.r.mode', 'oic.if.a', 'hvacMode', expand, readHvacMode(providerSchema));

    var hasFan = createResource('oic.r.sensor', 'oic.if.s', 'hasFan', expand, {
        value: providerSchema['has_fan']
    });

    var fanActive = createResource('oic.r.sensor', 'oic.if.s', 'fanActive', expand, {
        value: providerSchema['fan_timer_active']
    });

    return {
        opent2t: {
            schema: 'org.opent2t.sample.thermostat.superpopular',
            translator: 'opent2t-translator-com-nest-thermostat',
            controlId: providerSchema['device_id']
        },
        pi: providerSchema['uuid'],
        mnmn: 'Nest',
        mnmo: 'Undefined',
        n: providerSchema['name'],
        rt: ['org.opent2t.sample.thermostat.superpopular'],
        entities: [
            {
                rt: ['opent2t.d.thermostat'],
                di: deviceIds['opent2t.d.thermostat'],
                resources: [
                    ambientTemperature,
                    targetTemperature,
                    targetTemperatureHigh,
                    targetTemperatureLow,
                    awayMode,
                    ecoMode,
                    hvacMode,
                    hasFan,
                    fanActive
                ]
            }
        ]
    };
}


// Helper method to convert the translator schema to the device schema.
function translatorSchemaToDeviceSchema(translatorSchema) {

    // Quirks:
    // - Away Mode is not implemented at this time.

    var result = {};

    if (translatorSchema.n) {
        result['name'] = translatorSchema.n;
    }

    if (translatorSchema.targetTemperature) {
        result['target_temperature_' + translatorSchema.targetTemperature.units.toLowerCase()] = translatorSchema.targetTemperature.temperature;
    }

    if (translatorSchema.targetTemperatureHigh) {
        result['target_temperature_high_' + translatorSchema.targetTemperatureHigh.units.toLowerCase()] = translatorSchema.targetTemperatureHigh.temperature;
    }

    if (translatorSchema.targetTemperatureLow) {
        result['target_temperature_low_' + translatorSchema.targetTemperatureLow.units.toLowerCase()] = translatorSchema.targetTemperatureLow.temperature;
    }

    if (translatorSchema.hvacMode) {
        result['hvac_mode'] = translatorHvacModeToDeviceHvacMode(translatorSchema.hvacMode.modes[0]);
    }

    return result;
}

var deviceId;
var deviceType = 'thermostats';
var nestHub;

// This translator class implements the 'org.opent2t.sample.thermostat.superpopular' interface.
class Translator {

    constructor(deviceInfo) {
        console.log('Initializing device.');
        console.log(JSON.stringify(deviceInfo, null, 2));

        validateArgumentType(deviceInfo, 'deviceInfo', 'object');
        validateArgumentType(deviceInfo.hub, 'deviceInfo.hub', 'object');

        validateArgumentType(deviceInfo.deviceInfo.id, 'deviceInfo.deviceInfo.id', 'string');

        deviceId = deviceInfo.deviceInfo.id;
        nestHub = deviceInfo.hub;

        console.log('Javascript and Nest Thermostat initialized.');
    }

    // exports for the entire schema object

    // Queries the entire state of the thermostat
    // and returns an object that maps to the json schema org.opent2t.sample.thermostat.superpopular
    getThermostatResURI() {
        return nestHub.getDeviceDetailsAsync(deviceType, deviceId)
            .then((response) => {
                return deviceSchemaToTranslatorSchema(response);
            });
    }

    // Updates the current state of the thermostat with the contents of postPayload
    // postPayload is an object that maps to the json schema org.opent2t.sample.thermostat.superpopular
    //
    // In addition, returns the updated state (see sample in RAML)
    postThermostatResURI(postPayload) {

        console.log('postThermostatResURI called with payload: ' + JSON.stringify(postPayload, null, 2));

        var putPayload = translatorSchemaToDeviceSchema(postPayload);
        return nestHub.putDeviceDetailsAsync(deviceType, deviceId, putPayload)
            .then((response) => {
                return deviceSchemaToTranslatorSchema(response);
            });
    }

    // exports for individual properties

    getAmbientTemperature() {
        console.log('getAmbientTemperature called');

        return this.getThermostatResURI()
            .then(response => {
                return response.ambientTemperature.temperature;
            });
    }

    getTargetTemperature() {
        console.log('getTargetTemperature called');

        return this.getThermostatResURI()
            .then(response => {
                return response.targetTemperature.temperature;
            });
    }

    getTargetTemperatureHigh() {
        console.log('getTargetTemperatureHigh called');

        return this.getThermostatResURI()
            .then(response => {
                return response.targetTemperatureHigh.temperature;
            });
    }

    setTargetTemperatureHigh(value) {
        console.log('setTargetTemperatureHigh called with value: ' + value);

        var postPayload = {};
        postPayload.targetTemperatureHigh = { temperature: value, units: 'C' };

        return this.postThermostatResURI(postPayload)
            .then(response => {
                return response.targetTemperatureHigh.temperature;
            });
    }

    getTargetTemperatureLow() {
        console.log('getTargetTemperatureLow called');

        return this.getThermostatResURI()
            .then(response => {
                return response.targetTemperatureLow.temperature;
            });
    }

    setTargetTemperatureLow(value) {
        console.log('setTargetTemperatureLow called with value: ' + value);

        var postPayload = {};
        postPayload.targetTemperatureLow = { temperature: value, units: 'C' };

        return this.postThermostatResURI(postPayload)
            .then(response => {
                return response.targetTemperatureLow.temperature;
            });
    }
}

// Export the translator from the module.
module.exports = Translator;
