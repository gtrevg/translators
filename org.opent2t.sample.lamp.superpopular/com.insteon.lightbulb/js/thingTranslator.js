'use strict';
var OpenT2TError = require('opent2t').OpenT2TError;
var OpenT2TConstants = require('opent2t').OpenT2TConstants;
var crypto = require('crypto');

// This code uses ES2015 syntax that requires at least Node.js v4.
// For Node.js ES2015 support details, reference http://node.green/

function validateArgumentType(arg, argName, expectedType) {
    if (typeof arg === 'undefined') {
        throw new OpenT2TError(400, 'Missing argument: ' + argName + '. ' +
            'Expected type: ' + expectedType + '.');
    } else if (typeof arg !== expectedType) {
        throw new OpenT2TError(400, 'Invalid argument: ' + argName + '. ' +
            'Expected type: ' + expectedType + ', got: ' + (typeof arg));
    }
}

/**
 * Finds a resource for an entity in a schema
 */
function findResource(schema, di, resourceId) {
    // Find the entity by the unique di
    var entity = schema.entities.find((d) => {
        return d.di === di;
    });

    if (!entity) {
        throw new OpenT2TError(404, 'Entity - '+ di +' not found.');
    }

    var resource = entity.resources.find((r) => {
        return r.id === resourceId;
    });

    if (!resource) {
        throw new OpenT2TError(404, 'Resource with resourceId \"' +  resourceId + '\" not found.');
    }
    return resource;
}

/**
 * Generate a GUID for a given ID.
 */
function generateGUID(stringID) {
    var guid = crypto.createHash('sha1').update('Insteon' + stringID).digest('hex');
    return `${guid.substr(0, 8)}-${guid.substr(8, 4)}-${guid.substr(12, 4)}-${guid.substr(16, 4)}-${guid.substr(20, 12)}`;
}

/**
 * Returns a default value if the specified property is null, undefined, or an empty string
 */
function defaultValueIfEmpty(property, defaultValue) {
    if (property === undefined || property === null || property === "") {
        return defaultValue;
    } else {
        return property;
    }
}

function getDesiredBrightnessState(providerSchema, resourceSchema) {

    var result = {};

    if (providerSchema.hasOwnProperty('Level')) {

        var level = providerSchema.Level;

        // Special case: light is off
        if (providerSchema.hasOwnProperty('Power') &&
            providerSchema.Power == 'off') {
            level = 0; // Treat current dimmness as 0
        }

        if (resourceSchema.hasOwnProperty('dimmingSetPercentage')) {
            level = resourceSchema.dimmingSetPercentage;
        } else if (resourceSchema.hasOwnProperty('dimmingIncrementPercentage')) {
            level += resourceSchema.dimmingIncrementPercentage;
        } else if (resourceSchema.hasOwnProperty('dimmingDecrementPercentage')) {
            level -= resourceSchema.dimmingDecrementPercentage;
        }

        if (level < 0) {
            level = 0;
        } else if (level > 100) {
            level = 100;
        }

        result['command'] = level > 0 ? 'on' : 'off';
        result['level'] = level;
    }

    return result;
}

/**
 * Converts a representation of a platform from the Insteon API into an OCF representation.
 */
function providerSchemaToPlatformSchema(providerSchema, expand) {

    // Build the oic.r.switch.binary resource
    var power = {
        "href": "/power",
        "rt": ["oic.r.switch.binary"],
        "if": ["oic.if.a", "oic.if.baseline"]
    }

    // Build the oic.r.dimming resource
    var dim = {
        "href": "/dim",
        "rt": ["oic.r.light.dimming"],
        "if": ["oic.if.a", "oic.if.baseline"]
    }

    // Build the org.opent2t.r.light.dimPercentage resource
    var dimPercentage  = {
         "href": "/dimPercentage",
         "rt": ["org.opent2t.r.light.dimming"],
         "if": ["oic.if.a", "oic.if.baseline"]
    }

    // Include the values is expand is specified
    if (expand) {
        power.id = 'power';
        power.value = providerSchema['Power'] === 'on';

        dim.id = 'dim';
        dim.dimmingSetting = providerSchema['Level'];
        dim.range = [0, 100];

        dimPercentage.id = 'dimPercentage';
        dimPercentage.dimmingSetPercentage = dim.dimmingSetting;
        dimPercentage.dimmingIncrementPercentage = 0;
        dimPercentage.dimmingDecrementPercentage = 0;
    }

    return {
        opent2t: {
            schema: 'org.opent2t.sample.lamp.superpopular',
            translator: 'opent2t-translator-com-insteon-lightbulb',
            controlId: providerSchema['DeviceID']
        },
        availability: providerSchema['Reachable'] ? 'online' : 'offline',
        pi: generateGUID(providerSchema['DeviceID']),
        mnmn: defaultValueIfEmpty(providerSchema['Manufacturer'], 'Insteon'),
        mnmo: defaultValueIfEmpty(providerSchema['ProductType'], 'Light Bulb (Generic)'),
        n: providerSchema['DeviceName'],
        rt: ['org.opent2t.sample.lamp.superpopular'],
        entities: [
            {
                n: providerSchema['DeviceName'],
                rt: ['opent2t.d.light'],
                di: generateGUID( providerSchema['DeviceID'] + 'opent2t.d.light' ),
                icv: 'core.1.1.0',
                dmv: 'res.1.1.0',
                resources: [
                    power,
                    dim,
                    dimPercentage
                ]
            }
        ]
    };
}

function validateResourceGet(resourceId) {
    switch (resourceId) {
        case 'colourMode':
        case 'colourRgb':
        case 'colourChroma':
            throw new OpenT2TError(501, OpenT2TConstants.NotImplemented);
    }
}

// This translator class implements the 'org.opent2t.sample.lamp.superpopular' interface.
class Translator {

    constructor(deviceInfo, logger) {
        this.name = "opent2t-translator-com-insteon-lightbulb";
        this.logger = logger;

        validateArgumentType(deviceInfo, "deviceInfo", "object");

        this.controlId = deviceInfo.deviceInfo.opent2t.controlId;
        this.insteonHub = deviceInfo.hub;

        this.logger.info('Insteon Lightbulb initializing...Done');
    }

    /**
     * Queries the entire state of the lamp
     * and returns an object that maps to the json schema org.opent2t.sample.lamp.superpopular
     */
    get(expand, payload) {
        if (payload) {
            return providerSchemaToPlatformSchema(payload, expand);
        } else {
            return this.insteonHub.getDeviceDetailsAsync(this.controlId)
                .then((response) => {
                    return providerSchemaToPlatformSchema(response, expand);
                });
        }
    }

    /**
     * Finds a resource on a platform by the id
     */
    getDeviceResource(di, resourceId) {
        validateResourceGet(resourceId);

        return this.get(true)
            .then(response => {
                return findResource(response, di, resourceId);
            });
    }

    /**
     * Updates the specified resource with the provided payload.
     */
    postDeviceResource(di, resourceId, payload) {
        if (di === generateGUID( this.controlId + 'opent2t.d.light' )) {
            return this._resourceSchemaToProviderSchemaAsync(resourceId, payload)
                .then((putPayload) => {
                    return this.insteonHub.putDeviceDetailsAsync(this.controlId, putPayload)
                        .then((response) => {
                            var schema = providerSchemaToPlatformSchema(response, true);
                            return findResource(schema, di, resourceId);
                        });
                });
        } else {
            throw new OpenT2TError(404, OpenT2TConstants.DeviceNotFound);
        }
    }

    // exports for individual properties

    getDevicesPower(di) {
        return this.getDeviceResource(di, "power");
    }

    postDevicesPower(di, payload) {
        return this.postDeviceResource(di, "power", payload)
    }

    getDevicesColourMode(di) {
        return this.getDeviceResource(di, "colourMode");
    }

    getDevicesColourRGB(di) {
        return this.getDeviceResource(di, "colourRgb");
    }

    postDevicesColourRGB(di, payload) {
        return this.postDeviceResource(di, "colourRgb", payload);
    }

    getDevicesDim(di) {
        return this.getDeviceResource(di, "dim");
    }

    postDevicesDim(di, payload) {
        return this.postDeviceResource(di, "dim", payload);
    }

    getDevicesDimPercentage(di) {
        return this.getDeviceResource(di, "dimPercentage");
    }

    postDevicesDimPercentage(di, payload) {
        return this.postDeviceResource(di, "dimPercentage", payload);
    }

    getDevicesColourChroma(di) {
        return this.getDeviceResource(di, "colourChroma");
    }

    postDevicesColourChroma(di, payload) {
        return this.postDeviceResource(di, "colourChroma", payload);
    }

    postSubscribe(subscriptionInfo) {
        return this.insteonHub.postSubscribe(subscriptionInfo);
    }

    deleteSubscribe(subscriptionInfo) {
        return this.insteonHub._unsubscribe(subscriptionInfo);
    }

    /***
     * Converts an OCF platform/resource schema for calls to the Insteon API
     */
    _resourceSchemaToProviderSchemaAsync(resourceId, resourceSchema) {

        // build the object with desired state
        var result = {};
        switch (resourceId) {
            case 'power':
                result['command'] = resourceSchema.value ? 'on' : 'off';
                break;
            case 'dim':
                result['command'] = resourceSchema.dimmingSetting > 0 ? 'on' : 'off';
                result['level'] = resourceSchema.dimmingSetting;
                break;
            case 'dimPercentage':
                // Get the device from SmartThings in order to figure out what the current dimness setting is
                return this.insteonHub.getDeviceDetailsAsync(this.controlId).then((providerSchema) => {
                    return getDesiredBrightnessState(providerSchema, resourceSchema);
                });
            case 'n':
                result['DeviceName'] = resourceSchema.n;
                break;
            case 'colourMode':
            case 'colourRgb':
            case 'colourChroma':
                return Promise.reject(OpenT2TConstants.NotImplemented);
            default:
                // Error case
                return Promise.reject(OpenT2TConstants.InvalidResourceId);
        }
        return Promise.resolve(result);
    }
}

// Export the translator from the module.
module.exports = Translator;