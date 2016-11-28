const sleep = require('es6-sleep').promise;
var test = require('ava');
var OpenT2T = require('opent2t').OpenT2T;
var config = require('./testConfig');

console.log("Config:");
console.log(JSON.stringify(config, null, 2));

var translatorPath = require('path').join(__dirname, '..');
var hubPath = require('path').join(__dirname, '../../../../opent2t.p.hub/com.smartthings.hub/js');
var translator = undefined;
var controllId = undefined;

function getLamp(platforms) {
    for (var i = 0; i < platforms.length; i++) {
        var d = platforms[i];

        if (d.opent2t.translator === 'opent2t-translator-com-smartthings-lightbulb') {
            return d;
        }
    }

    return undefined;
}

// setup the translator before all the tests run
test.before(async () => {
    var hubTranslator = await OpenT2T.createTranslatorAsync(hubPath, 'thingTranslator', config);
    var platforms = await OpenT2T.invokeMethodAsync(hubTranslator, 'opent2t.p.hub', 'getPlatforms', []);
    var platformInfo = getLamp(platforms.platforms);
    controllId = platformInfo.opent2t.controlId;

    translator = await OpenT2T.createTranslatorAsync(translatorPath, 'thingTranslator', {'deviceInfo': platformInfo, 'hub': hubTranslator});
});

test.serial("Valid Lamp Translator", t => {
    t.is(typeof translator, 'object') && t.truthy(translator);
});

///
/// Run a series of tests to validate the translator
///

test.serial('GetPlatform', t => {
    return OpenT2T.invokeMethodAsync(translator, 'opent2t.p.light', 'get', [])
        .then((response) => {
            t.is(response.rt[0], 'opent2t.p.light');

            console.log('*** response: \n' + JSON.stringify(response, null, 2));
            
            // Get the power resource and verify that it does not have a power value (shallow get)
            var resource = response.entities[0].resources[0];
            t.is(resource.rt[0], 'oic.r.switch.binary');
            t.true(resource.value == undefined);
            t.true(resource.id == undefined);
        });
});

// Get the entire Lamp schema object expanded
test.serial('GetPlatformExpanded', t => {
    return OpenT2T.invokeMethodAsync(translator, 'opent2t.p.light', 'get', [true])
        .then((response) => {
            t.is(response.rt[0], 'opent2t.p.light');
            console.log('*** response: \n' + JSON.stringify(response, null, 2));

            // Get the power resource and verify that it has a power value (deep get)
            var resource = response.entities[0].resources[0];
            t.is(resource.id, 'power');
            t.is(resource.rt[0], 'oic.r.switch.binary');
            t.true(resource.value !== undefined);
        });
});

test.serial('GetPower', t => {
    return OpenT2T.invokeMethodAsync(translator, 'opent2t.p.light', 'getDevicesPower', [controllId])
        .then((response) => {
            console.log('*** response: \n' + JSON.stringify(response, null, 2));

            t.is(response.rt[0], 'oic.r.switch.binary');
            t.true(response.value !== undefined);
        });
});

test.serial('SetPowerOff', t => {
    return OpenT2T.invokeMethodAsync(translator, 'opent2t.p.light', 'postDeviceResource', [controllId, 'power', {'value': false }])
        .then((response) => {
            console.log('*** response: \n' + JSON.stringify(response, null, 2));

            t.is(response.rt[0], 'oic.r.switch.binary');
            t.false(response.value);
        });
});

test.serial('SetPowerON', t => {
    return OpenT2T.invokeMethodAsync(translator, 'opent2t.p.light', 'postDeviceResource', [controllId, 'power', {'value': true }])
        .then((response) => {
            console.log('*** response: \n' + JSON.stringify(response, null, 2));

            t.is(response.rt[0], 'oic.r.switch.binary');
            t.true(response.value);
        });
});

test.serial('GetDimming', t => {
    return OpenT2T.invokeMethodAsync(translator, 'opent2t.p.light', 'getDeviceResource', [controllId, 'dim'])
        .then((response) => {
            console.log('*** response: \n' + JSON.stringify(response, null, 2));

            t.is(response.rt[0], 'oic.r.light.dimming');
            t.true(response.dimmingSetting !== undefined);
        });
});

test.serial('SetDimming', t => {
    return OpenT2T.invokeMethodAsync(translator, 'opent2t.p.light', 'postDeviceResource', [controllId, 'dim', {'dimmingSetting': 10}])
        .then((response) => {
            console.log('*** response: \n' + JSON.stringify(response, null, 2));

            t.is(response.rt[0], 'oic.r.light.dimming');
            t.is(response.dimmingSetting, 10);
        });
});

