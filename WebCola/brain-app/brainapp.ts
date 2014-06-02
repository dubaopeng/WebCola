/// <reference path="../extern/three.d.ts"/>
/// <reference path="../extern/jquery.d.ts"/>
/// <reference path="../extern/jqueryui.d.ts"/>
/**
    This file contains all the control logic for brainapp.html (to manage interaction with
    the page, and the execution of applications/visualisations within the four views).

    Not implemented: removal of applications
*/
declare var dc;
declare var crossfilter;

// Holds data common to all datasets, and sends notifications when data changes
class CommonData {
    public brainCoords: number[][];
    public brainLabels: string[];
    public brainSurface;
    public nodeCount: number; // Number of coordinates

    coordCallbacks: Array<() => void> = new Array();
    labelCallbacks: Array<() => void> = new Array();
    surfaceCallbacks: Array<() => void> = new Array();

    regNotifyCoords(callback: () => void) {
        this.coordCallbacks.push(callback);
    }
    regNotifyLabels(callback: () => void) {
        this.labelCallbacks.push(callback);
    }
    regNotifySurface(callback: () => void) {
        this.surfaceCallbacks.push(callback);
    }
    // TODO: add deregistration capability
    notifyCoords() {
        this.coordCallbacks.forEach(function (c) { c() });
    }
    notifyLabels() {
        this.labelCallbacks.forEach(function (c) { c() });
    }
    notifySurface() {
        this.surfaceCallbacks.forEach(function (c) { c() });
    }
}

// Holds data for a specific dataset, and sends notifications when data changes
class DataSet {
    public simMatrix: number[][];
    public attributes: Attributes;
    simCallbacks: Array<() => void> = new Array();
    attCallbacks: Array<() => void> = new Array();

    regNotifySim(callback: () => void) {
        this.simCallbacks.push(callback);
    }
    regNotifyAttributes(callback: () => void) {
        this.attCallbacks.push(callback);
    }
    // TODO: add deregistration capability
    notifySim() {
        this.simCallbacks.forEach(function (c) {c()});
    }
    notifyAttributes() {
        this.attCallbacks.forEach(function (c) { c() });
    }
}

// Parses, stores, and provides access to brain node attributes from a file
class Attributes {
    values = {};
    columnNames: string[];
    numRecords: number;

    filteredRecords: Array<number>;

    constructor(text: string) {
        var lines = text.split(String.fromCharCode(13)); // Lines delimited by carriage returns...
        this.numRecords = lines.length - 1;
        this.columnNames = lines[0].split('\t');
        var numAttributes = this.columnNames.length;
        var values = new Array<Array<number>>(numAttributes); // Store the values of each attribute by index
        for (var i = 0; i < numAttributes; ++i) {
            values[i] = new Array<number>(this.numRecords);
        }
        for (var i = 1; i <= this.numRecords; ++i) { // Add the attributes of each record to the right value list
            var rec = lines[i].split('\t');
            for (var j = 0; j < numAttributes; ++j) {
                values[j][i - 1] = parseFloat(rec[j]);
            }
        }
        for (var i = 0; i < numAttributes; ++i) {
            this.values[this.columnNames[i]] = values[i];
        }
    }

    getRecord(index: number) {
        var record = '';
        var columns = this.columnNames.length;

        for (var j = 0; j < columns; ++j) {
            var v = this.values[this.columnNames[j]][index];
            var line = this.columnNames[j] + ": " + v + "; ";
            record += line;
        }

        return record
    }

    getValue(attribute: string, index: number) {
        return this.values[attribute][index];
    }

    getMin(attribute: string) {
        var array = this.values[attribute];
        if (array) {
            array.sort(function (a, b) { return a - b }); // sort numerically and ascending
            return array[0];
        }
        return null;
    }

    getMax(attribute: string) {
        var array = this.values[attribute];
        if (array) {
            array.sort(function (a, b) { return b - a }); // sort numerically and descending
            return array[0];
        }
        return null;
    }

    get(attribute: string) {
        return this.values[attribute];
    }
}

// Sub-applications implement this interface so they can be notified when they are assigned a dataset or when their view is resized
interface Application {
    setDataSet(dataSet: DataSet);
    resize(width: number, height: number);
    applyFilter(filteredIDs: Array<number>);
}

class DummyApp implements Application {
    setDataSet() { }
    resize() { }
    applyFilter() { }
}

// The loop class can be used to run applications that aren't event-based

interface Loopable {
    update(deltaTime: number): void;
}

class Loop {
    loopable;
    frameTimeLimit;
    timeOfLastFrame;

    constructor(loopable: Loopable, limit: number) {
        this.loopable = loopable;
        this.frameTimeLimit = limit;
        this.timeOfLastFrame = new Date().getTime();

        var mainLoop = () => {
            var currentTime = new Date().getTime();
            var deltaTime = (currentTime - this.timeOfLastFrame) / 1000;
            this.timeOfLastFrame = currentTime;

            // Limit the maximum time step
            if (deltaTime > this.frameTimeLimit)
                this.loopable.update(this.frameTimeLimit);
            else
                this.loopable.update(deltaTime);

            requestAnimationFrame(mainLoop);
        }

        requestAnimationFrame(mainLoop);
    }
}

// Set up jQuery UI layout objects
$('#control-panel').tabs({
    activate: function (event, ui) {
        if (ui.newPanel[0].id == 'tab-1') {
            // Reset data set icon positions
            resetDataSet1();
            resetDataSet2();
            $('#dataset1-icon-front').show();
            $('#dataset2-icon-front').show();
        } else {
            $('#dataset1-icon-front').hide();
            $('#dataset2-icon-front').hide();
        }
        if (ui.newPanel[0].id == 'tab-2') {
            // Reset all (visualisation) icons
            resetBrain3D();
            // Show all icons
            showVisIcons();
        } else {
            // Hide all icons
            hideVisIcons();
        }
    }
});

$('#accordion').accordion({ heightStyle: 'fill' });

// Set up data upload buttons
$('#select-coords').button();
$('#upload-coords').button().click(function () {
    var file = (<any>$('#select-coords').get(0)).files[0];
    if (file) {
        loadCoordinates(file);
        $('#shared-coords').css({ color: 'green' });
    }
});
$('#select-labels').button();
$('#upload-labels').button().click(function () {
    var file = (<any>$('#select-labels').get(0)).files[0];
    if (file) {
        loadLabels(file);
        $('#shared-labels').css({ color: 'green' });
    }
});
$('#select-matrix-1').button();
$('#upload-matrix-1').button().click(function () {
    var file = (<any>$('#select-matrix-1').get(0)).files[0];
    if (file) {
        loadSimilarityMatrix(file, dataSets[0]);
        $('#d1-mat').css({color: 'green'});
    }
});
$('#select-attr-1').button();
$('#upload-attr-1').button().click(function () {
    var file = (<any>$('#select-attr-1').get(0)).files[0];
    if (file) {
        loadAttributes(file, dataSets[0]);
        $('#d1-att').css({ color: 'green' });
    }
});
$('#select-matrix-2').button();
$('#upload-matrix-2').button().click(function () {
    var file = (<any>$('#select-matrix-2').get(0)).files[0];
    if (file) {
        loadSimilarityMatrix(file, dataSets[1]);
        $('#d2-mat').css({ color: 'green' });
    }
});
$('#select-attr-2').button();
$('#upload-attr-2 ').button().click(function () {
    var file =(<any> $('#select-attr-2').get(0)).files[0]
    if (file) {
        loadAttributes(file, dataSets[1]);
        $('#d2-att').css({ color: 'green' });
    }
});

$('#load-example-data').button().click(function () {
    $.get('data/coords.txt', function (text) {
        parseCoordinates(text);
        $('#shared-coords').css({ color: 'green' });
    });
    $.get('data/labels.txt', function (text) {
        parseLabels(text);
        $('#shared-labels').css({ color: 'green' });
    });
    $.get('data/mat1.txt', function (text) {
        parseSimilarityMatrix(text, dataSets[0]);
        $('#d1-mat').css({ color: 'green' });
    });
    $.get('data/attributes1.txt', function (text) {
        parseAttributes(text, dataSets[0]);
        $('#d1-att').css({ color: 'green' });

        setupCrossFilter(dataSets[0].attributes);
    });
});

$('#button-apply-filter').button().click(function () {
    if (!dataSets[0].attributes.filteredRecords) return;

    var fRecords = dataSets[0].attributes.filteredRecords;
    var idArray = new Array();

    for (var i = 0; i < fRecords.length; ++i) {
        var id = fRecords[i]["index"];
        if (id) idArray.push(id);
    } 

    if (apps[0]) apps[0].applyFilter(idArray);
    if (apps[1]) apps[1].applyFilter(idArray);
    if (apps[2]) apps[2].applyFilter(idArray);
    if (apps[3]) apps[3].applyFilter(idArray);
});


// Shorten the names of the views - they are referenced quite often
var tl_view = '#view-top-left';
var tr_view = '#view-top-right';
var bl_view = '#view-bottom-left';
var br_view = '#view-bottom-right';

// Create the object that the input target manager will use to update the pointer position when we're using the Leap
class PointerImageImpl {
    updatePosition(position) {
        $('#leap-pointer').offset({ left: position.x - 6, top: position.y - 6 });
    }
    show() {
        $('#leap-pointer').show();
    }
    hide() {
        $('#leap-pointer').hide();
    }
}

var pointerImage = new PointerImageImpl;

// Set up the class that will manage which view should be receiving input
var input = new InputTargetManager([tl_view, tr_view, bl_view, br_view], pointerImage);
input.setActiveTarget(0);

function getActiveTargetUnderMouse(x: number, y: number) {
    var id = -1;
    switch (getViewUnderMouse(x, y)) {
        case tl_view:
            id = 0;
            break;
        case tr_view:
            id = 1;
            break;
        case bl_view:
            id = 2;
            break;
        case br_view:
            id = 3;
            break;
    }
    return id;
}

input.regMouseDownCallback(getActiveTargetUnderMouse);

// Set up selectability
var selectTLView = function () {
    input.setActiveTarget(0);
    $(tl_view).css({ borderColor: 'black', zIndex: 1 });
    $(tr_view).css({ borderColor: 'white', zIndex: 0 });
    $(bl_view).css({ borderColor: 'white', zIndex: 0 });
    $(br_view).css({ borderColor: 'white', zIndex: 0 });
};
selectTLView(); // Select the top-left view straight away.
$(tl_view).click(selectTLView);
$(tr_view).click(function () {
    input.setActiveTarget(1);
    $(tl_view).css({ borderColor: 'white', zIndex: 0 });
    $(tr_view).css({ borderColor: 'black', zIndex: 1 });
    $(bl_view).css({ borderColor: 'white', zIndex: 0 });
    $(br_view).css({ borderColor: 'white', zIndex: 0 });
});
$(bl_view).click(function () {
    input.setActiveTarget(2);
    $(tl_view).css({ borderColor: 'white', zIndex: 0 });
    $(tr_view).css({ borderColor: 'white', zIndex: 0 });
    $(bl_view).css({ borderColor: 'black', zIndex: 1 });
    $(br_view).css({ borderColor: 'white', zIndex: 0 });
});
$(br_view).click(function () {
    input.setActiveTarget(3);
    $(tl_view).css({ borderColor: 'white', zIndex: 0 });
    $(tr_view).css({ borderColor: 'white', zIndex: 0 });
    $(bl_view).css({ borderColor: 'white', zIndex: 0 });
    $(br_view).css({ borderColor: 'black', zIndex: 1 });
});

// Set up icons

$('#brain3d-icon-front').draggable(
    {
        containment: 'body',
        stop: function (event) {
            resetBrain3D();

            var model = $('#brain3d-model-select').val();
            var file = 'BrainMesh_ICBM152.obj';

            if (model == 'ch2') {
                file = 'BrainMesh_ch2.obj';
            }
            else if (model == 'ch2_inflated') {
                file = 'BrainMesh_Ch2_Inflated.obj';
            }
            else if (model == 'icbm') {
                file = 'BrainMesh_ICBM152.obj';
            }

            loadBrainModel(file);

            switch (getViewUnderMouse(event.pageX, event.pageY)) {
                case tl_view:
                    apps[0] = new Brain3DApp(commonData, $(tl_view), input.newTarget(0));
                    break;
                case tr_view:
                    apps[1] = new Brain3DApp(commonData, $(tr_view), input.newTarget(1));
                    break;
                case bl_view:
                    apps[2] = new Brain3DApp(commonData, $(bl_view), input.newTarget(2));
                    break;
                case br_view:
                    apps[3] = new Brain3DApp(commonData, $(br_view), input.newTarget(3));
                    break;
            }

 
        }
    }
);
$('#dataset1-icon-front').draggable(
    {
        containment: 'body',
        stop: function (event) {
            resetDataSet1();
            switch (getViewUnderMouse(event.pageX, event.pageY)) {
                case tl_view:
                    if (apps[0]) apps[0].setDataSet(dataSets[0]);
                    break;
                case tr_view:
                    if (apps[1]) apps[1].setDataSet(dataSets[0]);
                    break;
                case bl_view:
                    if (apps[2]) apps[2].setDataSet(dataSets[0]);
                    break;
                case br_view:
                    if (apps[3]) apps[3].setDataSet(dataSets[0]);
                    break;
            }
        }
    }
);
$('#dataset2-icon-front').draggable(
    {
        containment: 'body',
        stop: function (event) {
            resetDataSet2();
            switch (getViewUnderMouse(event.pageX, event.pageY)) {
                case tl_view:
                    if (apps[0]) apps[0].setDataSet(dataSets[1]);
                    break;
                case tr_view:
                    if (apps[1]) apps[1].setDataSet(dataSets[1]);
                    break;
                case bl_view:
                    if (apps[2]) apps[2].setDataSet(dataSets[1]);
                    break;
                case br_view:
                    if (apps[3]) apps[3].setDataSet(dataSets[1]);
                    break;
            }
        }
    }
);

// Move an icon back to its origin
function resetIcon(object: string, location: string) {
    return function () {
        var rect = $(location).get(0).getBoundingClientRect();
        $(object).css({ left: rect.left, top: rect.top });
    };
}

var resetBrain3D = resetIcon('#brain3d-icon-front', '#brain3d-icon-back');
var resetDataSet1 = resetIcon('#dataset1-icon-front', '#dataset1-icon-back');
var resetDataSet2 = resetIcon('#dataset2-icon-front', '#dataset2-icon-back');
// Data set icons are visible when the page loads - reset them immediately
resetDataSet1();
resetDataSet2();

var visIcons = [$('#brain3d-icon-front')];

// These functions show and hide the icons for all the visualisations - they're called when we change tabs
function showVisIcons() {
    visIcons.forEach(function (icon) {
        icon.show();
    });
}
function hideVisIcons() {
    visIcons.forEach(function (icon) {
        icon.hide();
    });
}
hideVisIcons(); // Hide all the icons immediately

var apps = Array<Application>(new DummyApp(), new DummyApp(), new DummyApp(), new DummyApp());

// Initialize the view sizes and pin location
var viewWidth = $('#outer-view-panel').width();
var viewHeight = $('#outer-view-panel').height();
$('#pin').css({ left: viewWidth / 2, top: viewHeight / 2 });
setViewCrossroads(viewWidth / 2, viewHeight / 2);

// Set up the pin behaviour
$('#pin').draggable({ containment: '#outer-view-panel' }).on('drag', function (event: JQueryEventObject, ...args: any[]) {
    var ui = args[0];
    var x = ui.position.left;
    var y = ui.position.top;
    setViewCrossroads(x, y);
});

// Resizes the views such that the crossroads is located at (x, y) on the screen
function setViewCrossroads(x, y) {
    var viewWidth = $('#view-panel').width();
    var viewHeight = $('#view-panel').height();
    var lw = x - 3;
    var rw = viewWidth - x - 3;
    var th = y - 3;
    var bh = viewHeight - y - 3;
    $(tl_view).css({ width: lw, height: th });
    $(tr_view).css({ width: rw, height: th });
    $(bl_view).css({ width: lw, height: bh });
    $(br_view).css({ width: rw, height: bh });

    // Make callbacks to the application windows
    apps[0].resize(lw, th);
    apps[1].resize(rw, th);
    apps[2].resize(lw, bh);
    apps[3].resize(rw, bh);
}

window.addEventListener('resize', function () {
    var newViewWidth = $('#outer-view-panel').width();
    var newViewHeight = $('#outer-view-panel').height();
    var xScale = newViewWidth / viewWidth;
    var yScale = newViewHeight / viewHeight;
    var pinPos = $('#pin').position();
    var newPinX = pinPos.left * xScale;
    var newPinY = pinPos.top * yScale;

    $('#pin').css({ left: newPinX, top: newPinY });
    setViewCrossroads(newPinX, newPinY);

    viewWidth = newViewWidth;
    viewHeight = newViewHeight;
}, false);

// Find which view is currently located under the mouse
function getViewUnderMouse(x, y) {
    var innerViewLeft = $(tl_view).offset().left;
    if (x < innerViewLeft) {
        return null;
    } else {
        x -= innerViewLeft;
        if (y < $(tl_view).height()) {
            if (x < $(tl_view).width()) {
                return tl_view;
            } else {
                return tr_view;
            }
        } else {
            if (x < $(tl_view).width()) {
                return bl_view;
            } else {
                return br_view;
            }
        }
    }
}

// Resource loading
var commonData = new CommonData();
var dataSets = new Array<DataSet>(2);
dataSets[0] = new DataSet();
dataSets[1] = new DataSet();

// Load the physiological coordinates of each node in the brain
function loadCoordinates(file) {
    var reader = new FileReader();
    reader.onload = function () {
        parseCoordinates(reader.result);
    }
    reader.readAsText(file);
}

function parseCoordinates(text: string) {
    // For some reason the text file uses a carriage return to separate coordinates (ARGGgggh!!!!)
    var lines = text.split(String.fromCharCode(13));
    var len = lines.length - 1; // First line is just labels
    commonData.brainCoords = [Array(len), Array(len), Array(len)];
    commonData.nodeCount = len;
    for (var i = 0; i < len; ++i) {
        var words = lines[i + 1].split('\t');
        // Translate the coords into Cola's format
        commonData.brainCoords[0][i] = parseFloat(words[0]);
        commonData.brainCoords[1][i] = parseFloat(words[1]);
        commonData.brainCoords[2][i] = parseFloat(words[2]);
    }
    commonData.notifyCoords();
}

// Load the labels
function loadLabels(file) {
    var reader = new FileReader();
    reader.onload = function () {
        parseLabels(reader.result);
    }
    reader.readAsText(file);
}

function parseLabels(text: string) {
    commonData.brainLabels = text.split('\n').map(function (s) { return s.trim() });
    commonData.notifyLabels();
}

// Set up OBJ loading
var manager = new THREE.LoadingManager();
manager.onProgress = function (item, loaded, total) {
    console.log(item, loaded, total);
};
var loader = new (<any>THREE).OBJLoader(manager);
// Load the brain surface (hardcoded - it is not simple to load geometry from the local machine, but this has not been deeply explored yet).
// NOTE: The loaded model cannot be used in more than one WebGL context (scene) at a time - the geometry and materials must be .cloned() into
// new THREE.Mesh() objects by the application wishing to use the model.
function loadBrainModel(fileName: string) {
    loader.load('../examples/graphdata/' + fileName, function (object) {
        if (!object) {
            console.log("Failed to load brain surface.");
            return;
        }
        // Set brain mesh material
        object.traverse(function (child) {
            if (child instanceof THREE.Mesh) {
                child.material =
                new THREE.MeshLambertMaterial(
                    {
                        color: 0xffaaaa,
                        transparent: true,
                        opacity: 0.3
                    });
                //new THREE.MeshPhongMaterial({
                //    // light
                //    specular: '#a9fcff',
                //    // intermediate
                //    color: '#00abb1',
                //    // dark
                //    emissive: '#006063',
                //    shininess: 100,
                //    transparent: true,
                //    opacity: 0.3
                //});
                //new THREE.MeshBasicMaterial({
                //    wireframe: true,
                //    color: 'gray'
                //});
            }
        });

        commonData.brainSurface = object;
        commonData.notifySurface();
    });
}
loadBrainModel('BrainMesh_ICBM152.obj'); // Load the model right away

// Load the similarity matrix for the specified dataSet
function loadSimilarityMatrix(file, dataSet: DataSet) {
    var reader = new FileReader();
    reader.onload = function () {
        parseSimilarityMatrix(reader.result, dataSet);
    }
    reader.readAsText(file);
}

function parseSimilarityMatrix(text: string, dataSet: DataSet) {
    var lines = text.split('\n').map(function (s) { return s.trim() });
    dataSet.simMatrix = [];
    lines.forEach((line, i) => {
        if (line.length > 0) {
            dataSet.simMatrix.push(line.split(' ').map(function (string) {
                return parseFloat(string);
            }));
        }
    });
    dataSet.notifySim();
}

// Load the attributes for the specified dataSet
function loadAttributes(file, dataSet: DataSet) {
    var reader = new FileReader();
    reader.onload = function () {
        parseAttributes(reader.result, dataSet);
    }
    reader.readAsText(file);
}

function parseAttributes(text: string, dataSet: DataSet) {
    dataSet.attributes = new Attributes(text);
    dataSet.notifyAttributes();
}

// this function assumes the columns of the attributes are known
function setupCrossFilter(attrs: Attributes) {
    if (!attrs) return;

    // put attributes into an object array; round the attribute values for grouping in crossfilter
    var objectArray = new Array();
    for (var i = 0; i < attrs.numRecords; ++i) {
        // create an object for each record:
        var object = new Object();
        object["index"] = i;

        for (var j = 0; j < attrs.columnNames.length; ++j) {
            //object[attrs.columnNames[j]] = attrs.getValue(attrs.columnNames[j], i);

            var attrValue: number;
            if (j == 1) {
                attrValue = attrs.getValue(attrs.columnNames[j], i);
            }
            else if (j == 3) {
                attrValue = attrs.getValue(attrs.columnNames[j], i);
                attrValue = Math.round(attrValue / 20) * 20;
            }
            else {
                attrValue = attrs.getValue(attrs.columnNames[j], i);
                attrValue = parseFloat(attrValue.toFixed(2));
            }

            object[attrs.columnNames[j]] = attrValue;

        }

        objectArray.push(object);
    }

    // convert the object array to json format
    var json = JSON.parse(JSON.stringify(objectArray));
    //console.log(json);

    // create crossfilter
    var cfilter = crossfilter(json);
    var totalReadings = cfilter.size();
    var all = cfilter.groupAll();

    var dimArray = new Array();

    // create a data count widget
    // once created data count widget will automatically update the text content of the following elements under the parent element.
    // ".total-count" - total number of records
    // ".filter-count" - number of records matched by the current filters
    dc.dataCount(".dc-data-count")
        .dimension(cfilter)
        .group(all);



    // create the charts 
    for (var j = 0; j < attrs.columnNames.length; ++j) {

        var chart = dc.barChart("#barChart" + j);

        var columnName = attrs.columnNames[j];
        var minValue = attrs.getMin(columnName);
        var maxValue = attrs.getMax(columnName);

        var dim = cfilter.dimension(function (d) { return d[columnName]; });
        dimArray.push(dim);
        var group = dim.group().reduceCount(function (d) { return d[columnName]; });

        if (j == 1) {           
            chart
                .width(300)
                .height(150)
                .dimension(dim)
                .group(group)
                .x(d3.scale.linear().domain([0, 10]))
                .xAxisLabel(columnName)
                .centerBar(true)
                .on("filtered", filtered)
        }
        else {
            chart
                .gap(5)
                .width(300)
                .height(150)
                .dimension(dim)
                .group(group)
                .x(d3.scale.linear().domain([minValue, maxValue]))
                .xAxisLabel(columnName)
                .xUnits(function () { return 25; })               
                .centerBar(true)
                .on("filtered", filtered)
                .xAxis().ticks(6);
        }
    }

	// keep track of total readings
	d3.select("#total").text(totalReadings);

    // listener
    function filtered() {
        //console.log("filter event...");

        dataSets[0].attributes.filteredRecords = dimArray[0].top(Number.POSITIVE_INFINITY);

        if (dataSets[0].attributes.filteredRecords) {
            console.log("count: " + dataSets[0].attributes.filteredRecords.length);
        }

        $('#button-apply-filter').button({ disabled: false });
    }

    // render all charts
    dc.renderAll();
}

