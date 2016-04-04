/*
  GRAPHEAD

  There are many types of "point" objects in this code:
  - "dataPt" is USER DATA, these are formatted numbers for human interpretation
  - "coorPt" is a global COORDINATE on Easel's stage for drawing purposes 
  - "ComplexPoint" combines "dataPt" & "coorPt" into a single object (abbreviated as "plexPoint")
  - a "ComplexLine" combines 2 ComplexPoints
  - getCoorPoint() & getDataPoint() translates a DATA point to a COORdinate and vice versa, this is IMPORTANT!
  - easel's point object "cjs.Point" is a simple data structure like this: { x:x, y:y }
  it is the underlying data structure for the other point objects
  - However: regression.js and plotSmoothCurve use a 2 element array for a data structure: [ x, y ]
  there are some utility functions to switch between these 2 structures
  - a "DOT" is a synonym for a ComplexPoint that is NOT associated with a line or other structure 
  - i also use "DOT" to avoid saying "point" too often in the code :)
  - points and lines are associated with a "layer", a layer defines the visual style: colors, shapes, etc.
  - layers can be stacked on top of one another
  - Easel's Ticker is used when dragging points 
  - Full support for Touch enabled devices! Set touch to true. 

  Author: jason bonthron
*/

var DEFAULT_LAYER_STYLE = {
    size:8,
    color: "#EE0000",
    fill:  "#EE0000",
    strokeSize: .5,
    shape: "circle",
    shadow: "#dddddd",
    noDots: false,
    font: "Arial",
    fontSize: 12,
    fontColor: "#000000"
};

var UI_HIGHLIGHT_STYLE = {
    strokeSize: .5,
    color:"#000000", 
    fill:"#f4fe00",
    extend: 10
};

var ERROR_MSG_OVERLAP_PLOT  = "A point may NOT be plotted more than once.";
var ERROR_MSG_VERTICAL_LINE = "A point has already be plotted on this X axis.\n A function can only have one output, y, for each unique input, x.";


//--------------------------------------------------------------------------- ComplexPoint
function ComplexPoint(dataPt, coorPt, layer, graphead){

    this.id = Math.round(Math.random() * 10000); 
    this.layer = layer;

    this.dataPt = dataPt;
    this.coorPt = coorPt;

    this.highlight = false;
    this.hide = false;
    this.moveable = true;
    this.label = null;

    this.graphead = graphead;
}
ComplexPoint.prototype.moveToDataPt = function(dataPt){

    this.coorPt = this.graphead.getCoorPoint(dataPt);
    this.dataPt = this.graphead.getDataPoint(this.coorPt);
}
ComplexPoint.prototype.moveToCoorPt = function(coorPt){

    this.dataPt = this.graphead.getDataPoint(coorPt);
    this.coorPt = this.graphead.getCoorPoint(this.dataPt);
}


//--------------------------------------------------------------------------- ComplexLine
function ComplexLine(pt1, pt2, layer, lineType){

    this.id = Math.round(Math.random() * 10000); 
    this.layer = layer;

    this.pt1 = pt1;
    this.pt2 = pt2;

    this.hide = false;
    this.lineType = lineType;
}



//--------------------------------------------------------------------------- Graphead
function Graphead(){ 

    cjs.Ticker.setFPS(40);
    cjs.Ticker.setPaused(true);
}


//--------------------------------------------------------------------------- init
Graphead.prototype.init = function(canvasID, itemID, styleObj){

    this.canvasID    = canvasID;
    this.itemID      = itemID;
    this.canvas      = document.getElementById(this.canvasID);
    this.canvasW     = this.canvas.width;
    this.canvasH     = this.canvas.height;
    this.cacheWidth  = this.canvasW;
    this.cacheHeight = this.canvasH;

    this.stage = new cjs.Stage(this.canvasID);

    this.touch = false;
    this.style = styleObj;

    this.unitSize  = 30;  // display size of each square
    this.unitsWide = 10;
    this.unitsHigh = 10;

    this.snap = true;
    this.snapScaleX = 1; 
    this.snapScaleY = 1;

    // overwrite defaults here...
    if(styleObj){
        for(var i in styleObj){
            if(this[i] != null){ this[i] = styleObj[i]; };
        };
    }

    this.grid = new Grid(this.canvas, this.unitsWide, this.unitsHigh, this.unitSize, this.style);
    this.stage.addChild(this.grid);
    this.stage.update();

    // if a snap scale was not specified, then use the scaleFactor
    if(!styleObj || !styleObj['snapScaleX']){  this.snapScaleX = this.grid.get("scaleFactorX");  }
    if(!styleObj || !styleObj['snapScaleY']){  this.snapScaleY = this.grid.get("scaleFactorY");  }


    this.LAYERS = {};
    this.POINTS = [];

    this.LINES       = {};
    this.CONNECTIONS = {};
    this.PIECEWISE   = {};
    this.CURVES      = {};
    this.REGRESSIONS = {};

    this.UI_clickActionLayer   = null;
    this.UI_clickActionClosure = null;
    this.userPointLimit        = null;
    
    if(this.touch){ cjs.Touch.enable(this.stage); };

    var self = this;

    this.stageClick = function(evt){ 

        if(!self.pointIsOnGrid(self.getStagePt())){ return; };

        var hit = self.testPointHit();
        if(hit){
            self.startDrag(hit, true);
        }else{
            if(typeof self.UI_clickActionClosure == "function"){
                self.UI_clickActionClosure()
            };
        };
    };
    this.stage.addEventListener("stagemousedown", this.stageClick);

    this.allListeners = {};
    this.UNDOstack = [];
}


//--------------------------------------------------------------------------- getCoorPoint
// given a mathematical data point, i return the internal x,y coordinates for the stage
Graphead.prototype.getCoorPoint = function(pt, noSnap){

    if(this.snap && (noSnap != true)){
        pt.x = RoundFixed((pt.x/this.snapScaleX), this.grid.get("decimalX")) * this.snapScaleX;
        pt.y = RoundFixed((pt.y/this.snapScaleY), this.grid.get("decimalY")) * this.snapScaleY;
    }

    var origin = this.grid.getOriginPt();
    var x = origin.x + (((pt.x - this.grid.get("scaleStartX"))/this.grid.get("scaleFactorX")) * this.grid.get("unitSizeX"));
    var y = origin.y - (((pt.y - this.grid.get("scaleStartY"))/this.grid.get("scaleFactorY")) * this.grid.get("unitSizeY"));

    var pt = this.restrictToGridBoundaries({x:x, y:y});

    return pt;
}


//--------------------------------------------------------------------------- getDataPoint
// given internal x,y coordinates on the stage, I return the mathematical data point 
Graphead.prototype.getDataPoint = function(pt, noSnap){

    pt = this.restrictToGridBoundaries(pt);

    var origin = this.grid.getOriginPt();
    var x = ((pt.x - origin.x)/ this.grid.get("unitSizeX"))  * this.grid.get("scaleFactorX");
    var y = ((origin.y - pt.y) / this.grid.get("unitSizeY")) * this.grid.get("scaleFactorY");

    if(this.snap && (noSnap != true)){
        x = Math.round(x/this.snapScaleX) * this.snapScaleX;
        y = Math.round(y/this.snapScaleY) * this.snapScaleY;
    }

    x = this.grid.get("scaleStartX") + x;
    y = this.grid.get("scaleStartY") + y;

    return new cjs.Point(x,y);
}


//--------------------------------------------------------------------------- restrictToGridBoundaries
Graphead.prototype.restrictToGridBoundaries = function(coorPt){

    var x = coorPt.x;
    var y = coorPt.y;

    // keep point within grid boundaries
    var gridObj = this.grid.getGridObj();

    var gridMinX = gridObj.x;
    var gridMaxX = (gridObj.x + this.grid.get("gridWidth"));
    if(x > gridMaxX){ x = gridMaxX; };
    if(x < gridMinX){ x = gridMinX; };

    var gridMinY = (gridObj.y);
    var gridMaxY = (gridObj.y + this.grid.get("gridHeight"));
    if(y > gridMaxY){ y = gridMaxY; };
    if(y < gridMinY){ y = gridMinY; };
    
    return new cjs.Point(x,y);
};


//--------------------------------------------------------------------------- getComplexPointByData
Graphead.prototype.getComplexPointByData = function(dataPt, layer, noSnap){

    var coorPt = this.getCoorPoint(dataPt, noSnap);
    var dataPt = this.getDataPoint(coorPt, noSnap);
    
    return new ComplexPoint(dataPt, coorPt, layer, this);
}


//--------------------------------------------------------------------------- getComplexPointByCoor
Graphead.prototype.getComplexPointByCoor = function(coorPt, layer, noSnap){

    var dataPt = this.getDataPoint(coorPt, noSnap);
    var coorPt = this.getCoorPoint(dataPt, noSnap);
    
    return new ComplexPoint(dataPt, coorPt, layer, this);
}


//--------------------------------------------------------------------------- addLayer
Graphead.prototype.addLayer = function(arr, name, persist, styleObj){ 

    if(this.LAYERS[name]){ return; }

    var STYLE = clone(DEFAULT_LAYER_STYLE);

    if(styleObj){
        for(var i in styleObj){ if(STYLE[i] != null){ STYLE[i] = styleObj[i]; }; };
    };

    var layer = new cjs.Container();
    var shape = new cjs.Shape();
    layer.addChild(shape);

    layer.name = name;
    layer.shape = shape;
    layer.persist = persist;
    layer.styleObj = STYLE;
    layer.stage = this.stage;
    layer.graphead = this;

    layer.x = layer.y = 0.5;

    this.LAYERS[name] = layer;

    this.LINES[name]       = []; 
    this.CONNECTIONS[name] = []; 
    this.PIECEWISE[name]   = []; 
    this.CURVES[name]      = []; 
    this.REGRESSIONS[name] = []; 

    this.stage.addChild(layer);

    if(arr && arr.length){ this.addData(layer.name, arr); }
    return layer;
}


//--------------------------------------------------------------------------- addData
Graphead.prototype.addData = function(layerName, arr){ 

    if(this.LAYERS[layerName] == null){ return };
    if(!arr.length){ return; }

    var layer = this.LAYERS[layerName];

    // distinquish lines from points
    for(var i=0; i < arr.length; i++){
        if(isArray(arr[i])){
            
            var dataPt1  = arr[i][0];
            var dataPt2  = arr[i][1];
            var lineType = arr[i][2];
            
            var plexPt1 = this.getComplexPointByData(dataPt1, layer);
            var plexPt2 = this.getComplexPointByData(dataPt2, layer);
            
            this.addTo_POINTS(plexPt1);
            this.addTo_POINTS(plexPt2);
            this.LINES[layer.name].push(new ComplexLine(plexPt1, plexPt2, layer, lineType));
        }else{
            var dataPt = arr[i];
            var plexPt = this.getComplexPointByData(dataPt, layer);
            this.addTo_POINTS(plexPt);
        };
    };    

    this.drawLayer(layer);
}


//--------------------------------------------------------------------------- deleteLayer
Graphead.prototype.deleteLayer = function(layerName){ 

    this.clearLayer(layerName)

    this.stage.removeChild(this.LAYERS[layerName]);
    delete this.LAYERS[layerName]
    this.stage.update();
}


//--------------------------------------------------------------------------- drawLayer
Graphead.prototype.drawLayer = function(layer){ 

    var g = layer.shape.graphics;
    g.clear();

    // draw lines
    for(var i=0; i < this.LINES[layer.name].length; i++){
        this.drawLine(this.LINES[layer.name][i]); 
    };

    // draw connections
    if(this.CONNECTIONS[layer.name].length > 1){
        for(var i=0; i < this.CONNECTIONS[layer.name].length -1; i++){
            var l = new ComplexLine(this.CONNECTIONS[layer.name][i], this.CONNECTIONS[layer.name][(i+1)], layer, "CONNECTED");        
            this.drawLine(l); 
        };
    };

    // draw piecewise
    if(this.PIECEWISE[layer.name].length){
        var arr = this.PIECEWISE[layer.name].sort(sortByX);
        
        for(var i=0; i < (arr.length-1); i++){
            var l = new ComplexLine(arr[i], arr[(i+1)], layer, "PIECEWISE");        
            this.drawLine(l); 
        };
    };

    // draw curves
    if(this.CURVES[layer.name].length){
        var arr = this.plotCurve(this.CURVES[layer.name], layer); //plot

        for(var i=0; i < (arr.length-1); i++){
            var l = new ComplexLine(arr[i], arr[(i+1)], layer, "CURVE");        
            this.drawLine(l); 
        };
    };

    // draw regression
    if(this.REGRESSIONS[layer.name].length){
        var dataLayerName  = this.REGRESSIONS[layer.name][0];
        var regressionType = this.REGRESSIONS[layer.name][1];
        var pts = this.getAllUniqueDataPoints(dataLayerName);

        if(pts.length > 1){
            var arr = this.plotRegression(pts, layer, regressionType); 
            
            for(var i=0; i < (arr.length-1); i++){
                var l = new ComplexLine(arr[i], arr[(i+1)], layer, "CURVE");        
                this.drawLine(l); 
            };
        };
    };
    
    // draw points
    for(var i=0; i < this.POINTS.length; i++){
        var p = this.POINTS[i];
        if(p.layer == layer){  this.drawPoint(p);  };
    };

    this.stage.update();
}


//--------------------------------------------------------------------------- drawLayers
Graphead.prototype.drawLayers = function(){ 
    
    for(var i in this.LAYERS){
        if(!this.LAYERS[i].persist){ this.drawLayer(this.LAYERS[i]); };
    };
}


//--------------------------------------------------------------------------- clearLayer
Graphead.prototype.clearLayer = function(layerName){ 

    if(this.LAYERS[layerName] == null){ return };
    if(this.LAYERS[layerName].persist){ return };

    var l = this.LAYERS[layerName];

    var removeArr = [];

    for(var i=0; i < this.POINTS.length; i++){ 
        var pt = this.POINTS[i];
        if(pt.layer == l){ removeArr.push(pt); };
    }

    this.removeFrom_POINTS(removeArr);

    // remove EXTENDED line labels
    for(var j=0; j < this.LINES[layerName].length; j++){
        if(this.LINES[layerName][j].labelPt){
            this.removeLabel(this.LINES[layerName][j].labelPt);
        };
    };

    this.LINES[layerName]       = [];
    this.CONNECTIONS[layerName] = [];
    this.PIECEWISE[layerName]   = [];
    this.CURVES[layerName]      = [];
    this.REGRESSIONS[layerName] = [];

    l.shape.graphics.clear();
    this.stage.update();
}


//--------------------------------------------------------------------------- clearGraphics
Graphead.prototype.clearGraphics = function(l){ 

    this.LAYERS[l.name].shape.graphics.clear();
}


//--------------------------------------------------------------------------- drawPoint
Graphead.prototype.drawPoint = function(plexPt, styleObj){ 

    if(plexPt.hide){
        if(plexPt.label){ plexPt.label.visible = false; };
        return; 
    };

    var layer = plexPt.layer;
    var STYLE = clone(layer.styleObj);
    var g = layer.shape.graphics;

    var x = plexPt.coorPt.x;
    var y = plexPt.coorPt.y;

    if(styleObj){
        for(var i in styleObj){
            if(STYLE[i] != null){ STYLE[i] = styleObj[i];};
        };
    }

    // highlight
    if(plexPt.highlight){
        strokeShape(g, STYLE.shape, x, y, UI_HIGHLIGHT_STYLE, (STYLE.size + UI_HIGHLIGHT_STYLE.extend));
    }

    strokeShape(g, STYLE.shape, x, y, STYLE, STYLE.size);

    if(plexPt.label){
        plexPt.label.visible = true;
        plexPt.label.x = plexPt.coorPt.x + (STYLE.size + UI_HIGHLIGHT_STYLE.extend)/2;
        plexPt.label.y = plexPt.coorPt.y - (layer.styleObj.size/2);
    };
}


//--------------------------------------------------------------------------- drawLine
Graphead.prototype.drawLine = function(line){ 
    
    if(line.hide){ return; };

    var layer = line.layer;
    var STYLE = layer.styleObj;
    var g = layer.shape.graphics;

    var pt1 = line.pt1.coorPt;
    var pt2 = line.pt2.coorPt;
    
    if(line.lineType == "EXTENDED"){
        var exLine = this.extrapolateLine(line);
        var exPt1 = exLine.pt1.coorPt;
        var exPt2 = exLine.pt2.coorPt;

        g.setStrokeStyle(STYLE.strokeSize)
        g.beginStroke(STYLE.color);
        g.moveTo(exPt1.x, exPt1.y);
        g.lineTo(exPt2.x, exPt2.y);
        g.endStroke();

        if(line.labelPt && line.labelPt.label){
            // label uses right-most extrapolated point
            // if the label is at the top, move it out of the grid
            var exPtForLabel = (exLine.pt1.coorPt.x > exLine.pt2.coorPt.x) ? exLine.pt1.coorPt : exLine.pt2.coorPt;
            var gridObj = this.grid.getGridObj()
            var gridMinY = (gridObj.y);
            var spacing = 5;
            if(exPtForLabel.y == gridMinY){exPtForLabel.y -= (gridMinY + spacing);}
            
            line.labelPt.coorPt = exPtForLabel;
            line.labelPt.label.visible = true;
            line.labelPt.label.x = exPtForLabel.x + spacing;
            line.labelPt.label.y = exPtForLabel.y + spacing;
        };

    }else{
        g.setStrokeStyle(STYLE.strokeSize)
        g.beginStroke(STYLE.color);
        g.moveTo(pt1.x, pt1.y);
        g.lineTo(pt2.x, pt2.y);
        g.endStroke();
    }

    if(line.lineType == "CURVE"){ return; }

    if(STYLE.noDots != true){
        this.drawPoint(line.pt1);
        this.drawPoint(line.pt2);
    };
}


//--------------------------------------------------------------------------- enableClickAction
Graphead.prototype.enableClickAction = function(layerName, actionType){ 
    
    if(this.LAYERS[layerName] == null){ return };

    var layer = this.LAYERS[layerName];
    this.moveToTop(layer);
    this.drawLayer(layer);
    this.UI_clickActionLayer = layer;

    var f;
    var self = this;

    switch(actionType.toLowerCase()){

    case "dot":
        f = function(evt){ self.addDot(evt); };
        break;

    case "line":
        var type     = arguments[2]; //"overloading"
        var multiple = arguments[3]; 
        var label    = arguments[4]; 
        
        f = function(evt){ self.addClickLine(layerName, type, multiple, label); };
        break;

    case "connected":
        var label = arguments[2]; //"overloading"
        f = function(evt){ self.addConnectedSegment(layerName, label); };
        break;
        
    case "piecewise":
        f = function(evt){ self.addPiecewise(layerName); };
        break;

    case "curve":
        f = function(evt) { 
            var stagePt = self.getStagePt();
            var plexPt = self.getComplexPointByCoor(stagePt, self.UI_clickActionLayer);
            
            if(self.verticalLineTest(plexPt)){
                alert(ERROR_MSG_VERTICAL_LINE);
                return;
            };
            
            self.addDot(evt);
            self.addCurve(layerName);
            self.logAction("clickCurve", layerName);
        };
        break;

    default:
        f = function(){ console.log("graphead: i don't recognize the click action"); };
    };
    
    this.UI_clickActionClosure = function(evt){
        if(self.overPointLimit()){ return; }
        f(evt);
    };
}


//--------------------------------------------------------------------------- disableClickAction
Graphead.prototype.disableClickAction = function(){ 

    this.stage.removeEventListener("stagemousedown", this.UI_clickActionClosure);
    this.UI_clickActionClosure = null;
}


//--------------------------------------------------------------------------- addDot
Graphead.prototype.addDot = function(){ 

    var stagePt = this.getStagePt();
    var plexPt  = this.getComplexPointByCoor(stagePt, this.UI_clickActionLayer);
    this.addTo_POINTS(plexPt);

    this.drawLayers();
    this.logAction("addDot", plexPt);
}


//--------------------------------------------------------------------------- removeDot
Graphead.prototype.removeDot = function(plexPt){ 

    this.removeFrom_POINTS(plexPt);

    if(plexPt.label){ this.removeLabel(plexPt); }

    this.drawLayers();
}


//--------------------------------------------------------------------------- createLine
Graphead.prototype.createLine = function(layerName, type, label){ 

    if(this.LAYERS[layerName] == null){ return };

    var layer = this.LAYERS[layerName];
    var pt1 = this.getComplexPointByCoor(this.getStagePt(), layer);
    var pt2 = this.getComplexPointByCoor(this.getStagePt(), layer);

    var line = new ComplexLine(pt1, pt2, layer, type);
    pt1.hide = pt2.hide = line.hide = true;

    this.addTo_POINTS(pt1);
    this.addTo_POINTS(pt2);
    this.LINES[layer.name].push(line);        

    if(label){ 
        if(type == "EXTENDED"){
            // note: the labelPt is NOT added to the POINTS array
            // therefore, it will not get drawn, but the label will
            line.labelPt = this.getComplexPointByCoor(this.getStagePt(), layer);
            this.addLabelToPoint(layerName, line.labelPt, label); 
        }else{
            this.addLabelToPoint(layerName, line.pt2, label); 
        };
    };
    this.logAction("addLine", line);

    return line;
}


//--------------------------------------------------------------------------- addLine
Graphead.prototype.addLine = function(layerName, label){ 

    if(this.LAYERS[layerName] == null){ return };
    var layer = this.LAYERS[layerName];

    if(this.actionInProgress){ return; };
    this.actionInProgress = true;

    var line = this.createLine(layerName, "EXTENDED", label);
    this.twoPointLineAnime(line);
}


//--------------------------------------------------------------------------- addClickLine
Graphead.prototype.addClickLine = function(layerName, type, multiple, label){ 

    if(this.LAYERS[layerName] == null){ return };
    var layer = this.LAYERS[layerName];

    if(!type){type = "EXTENDED"};
    type = type.toUpperCase();

    if(multiple == false){ this.clearLayer(layerName); }; 

    this.stage.removeEventListener("stagemousedown", this.stageClick);

    var line = this.createLine(layerName, type, label);

    var pt1 = line.pt1;
    var pt2 = line.pt2;
    pt1.moveToCoorPt(this.getStagePt());
    pt1.hide = false;

    this.moveToTop(line.layer);
    this.drawLayer(line.layer);

    var self = this;
    var clos = function(evt){
        if(!self.pointIsOnGrid(self.getStagePt())){ return; };

        var hit = self.testPointHit();
        if(hit){ return; };

        pt2.moveToCoorPt(self.getStagePt());
        pt2.hide = false;
        line.hide = false;
        self.drawLayer(line.layer);
        self.stage.removeEventListener("stagemousedown", clos);
        self.stage.addEventListener("stagemousedown", self.stageClick);
    };

    this.stage.addEventListener("stagemousedown", clos);
}


//--------------------------------------------------------------------------- addSegment
Graphead.prototype.addSegment = function(layerName, label){ 

    if(this.actionInProgress){ return; };
    this.actionInProgress = true;

    var line = this.createLine(layerName, "SEGMENT", label);
    this.twoPointLineAnime(line);
}


//--------------------------------------------------------------------------- addConnectedSegment
Graphead.prototype.addConnectedSegment = function(layerName, label){ 

    if(this.LAYERS[layerName] == null){ return };
    var layer = this.LAYERS[layerName];

    if(this.CONNECTIONS[layerName].length == 0){ 
        var pt1 = this.getComplexPointByCoor(this.getStagePt(), layer);
        if(label){ this.addLabelToPoint(layerName, pt1, label); }
        this.CONNECTIONS[layerName].push(pt1);  
        this.addTo_POINTS(pt1);
        this.logAction("addConnectedPt", pt1);
        this.drawLayers();
    }else{
        var len = this.CONNECTIONS[layerName].length;
        var pt1 = this.CONNECTIONS[layerName][len-1];
        var pt2 = this.getComplexPointByCoor(this.getStagePt(), layer);
        if(label){ this.swapLabel(pt1, pt2); };
        this.addTo_POINTS(pt2);
        this.CONNECTIONS[layerName].push(pt2);  
        this.logAction("addConnectedPt", pt2);
        this.drawLayers();
    };
}


//--------------------------------------------------------------------------- addPiecewise
Graphead.prototype.addPiecewise = function(layerName){ 

    if(this.LAYERS[layerName] == null){ return };
    var layer = this.LAYERS[layerName];
    
    var plexPt = this.getComplexPointByCoor(this.getStagePt(), layer);

    if(this.verticalLineTest(plexPt)){
        alert(ERROR_MSG_VERTICAL_LINE);
        return;
    };

    this.logAction("addPiecewisePt", plexPt);
    this.addTo_POINTS(plexPt);

    var self = this;
    var clos = function(){
        self.PIECEWISE[layer.name].push(plexPt);
        self.stage.removeEventListener("stagemouseup", clos);
        self.drawLayers();
    };
    this.stage.addEventListener("stagemouseup", clos);
}


//--------------------------------------------------------------------------- twoPointLineAnime
Graphead.prototype.twoPointLineAnime = function(line){ 

    var self = this;

    var SHADOW_MOUSE = function(evt){
        pt1.moveToCoorPt(self.getStagePt());
        self.drawLayer(line.layer);
    }

    var COMPLETE_LINE = function(evt){

        pt1.moveToCoorPt(self.getStagePt());

//        if(self.testPointOverlap(pt1)){ return; };

        self.stage.removeEventListener("stagemousemove", SHADOW_MOUSE);
        self.stage.removeEventListener("stagemouseup", COMPLETE_LINE);

        pt2.moveToCoorPt(self.getStagePt());
        self.startDrag(pt2, false);

        pt2.hide = false;
        line.hide = false;

    }

    this.stage.removeEventListener("stagemousedown", this.stageClick);

    this.moveToTop(line.layer);
    this.drawLayer(line.layer);

    var pt1 = line.pt1;
    var pt2 = line.pt2;
    pt1.hide = false;
    this.stage.addEventListener("stagemousemove", SHADOW_MOUSE);
    this.stage.addEventListener("stagemouseup", COMPLETE_LINE);
}


//--------------------------------------------------------------------------- removeLine
Graphead.prototype.removeLine = function(l){ 

    var len = this.LINES[l.layer.name].length
    while (len--) {
        if(this.LINES[l.layer.name][len] == l){ this.LINES[l.layer.name].splice(len,1); };
    }

    this.removeDot(l.pt1);
    this.removeDot(l.pt2);

    if(l.lineType == "EXTENDED" && l.labelPt != null){
        this.removeLabel(l.labelPt);
        l.labelPt = null;
    };

    this.drawLayers();
}


//--------------------------------------------------------------------------- extropolateLine
// given 2 points I calculate the slope and determine the furthest points
// that lie on the graph
Graphead.prototype.extrapolateLine = function(line){

    // NOTE: only global stage coordinates are used in the code below

    var layer = line.layer;
    var plexPt1 = line.pt1;
    var plexPt2 = line.pt2;

    // Grid Min/Max
    var gridObj = this.grid.getGridObj()
    var gridMinX = gridObj.x;
    var gridMaxX = (gridObj.x + this.grid.get("gridWidth"));
    var gridMinY = (gridObj.y);
    var gridMaxY = (gridObj.y + this.grid.get("gridHeight"));

    var m = getSlope(plexPt1, plexPt2); // SLOPE 

    // this can happen before the inital mouse move, supress the error 
    if(isNaN(m)){ 
        return line;
    }; 

    // vertical lines have undefined slope
    if(m == Number.POSITIVE_INFINITY || m == Number.NEGATIVE_INFINITY)
    {
        this.getComplexPointByCoor
        var endPoint1 = this.getComplexPointByCoor({x:plexPt1.coorPt.x, y:gridMinY}, layer);        
        var endPoint2 = this.getComplexPointByCoor({x:plexPt1.coorPt.x, y:gridMaxY}, layer);        
    }
    else if(m == 0)
    {  // horizontal lines have a zero slope
        var endPoint1 = this.getComplexPointByCoor({x:gridMaxX, y:plexPt1.coorPt.y}, layer);        
        var endPoint2 = this.getComplexPointByCoor({x:gridMinX, y:plexPt1.coorPt.y}, layer);        
    }
    else
    {   // using the point slope formula, find intersections at the grid's outline 
        // y2 - y1 = m * (x2 - x1)               

        var X_intersection_at_MinY = ((gridMinY - plexPt1.coorPt.y)/m) + plexPt1.coorPt.x
        var X_intersection_at_MaxY = ((gridMaxY - plexPt1.coorPt.y)/m) + plexPt1.coorPt.x
        var Y_intersection_at_MinX = m * (gridMinX - plexPt1.coorPt.x) + plexPt1.coorPt.y
        var Y_intersection_at_MaxX = m * (gridMaxX - plexPt1.coorPt.x) + plexPt1.coorPt.y

        var coor1, coor2, endPoint1, endPoint2;

        if(m < 0){   // negative slope

            if(Y_intersection_at_MinX > gridMaxY){
                coor1 = { x:X_intersection_at_MaxY, y:gridMaxY };
            }else{
                coor1 = { x:gridMinX, y:Y_intersection_at_MinX };
            };
            
            if(Y_intersection_at_MaxX < gridMinY){
                coor2 = { x:X_intersection_at_MinY, y:gridMinY };
            }else{
                coor2 = { x:gridMaxX, y:Y_intersection_at_MaxX };
            };

        }else{   // positive slope

            if(Y_intersection_at_MinX < gridMinY){
                coor1 = { x:X_intersection_at_MinY, y:gridMinY };
            }else{
                coor1 = { x:gridMinX, y:Y_intersection_at_MinX };
            };

            if(Y_intersection_at_MaxX > gridMaxY){
                coor2 = { x:X_intersection_at_MaxY, y:gridMaxY };
            }else{
                coor2 = { x:gridMaxX, y:Y_intersection_at_MaxX };
            };
        };

        endPoint1 = this.getComplexPointByCoor(coor1, layer, true);
        endPoint2 = this.getComplexPointByCoor(coor2, layer, true);
    };

    return new ComplexLine(endPoint1, endPoint2, layer, "EXTENDED");
}


//--------------------------------------------------------------------------- addCurve
Graphead.prototype.addCurve = function(dataLayerName){ 

    if(this.LAYERS[dataLayerName] == null){ return };

    this.CURVES[dataLayerName] = this.getAllUniqueDataPoints(dataLayerName);
    this.logAction("addCurve", dataLayerName);

    this.drawLayer(this.LAYERS[dataLayerName]);
}


//--------------------------------------------------------------------------- plotCurve
Graphead.prototype.plotCurve = function(arr, layer){ 

    var formattedArr = formatPlexPointsToArrayPoints(arr);
    var sortedArr    = formattedArr.sort(sortRegPointsByX);
    var returnArr    = [];

    var c = plotSmooveCurve(sortedArr);

    for(var i=0; i < (c.length - 1); i++){

        var x = c[i][0];
        var y = c[i][1];
        var dataPt = new cjs.Point(x,y);
        var plexPt1 = this.getComplexPointByData(dataPt, layer, true);

        var x = c[i+1][0];
        var y = c[i+1][1];
        var dataPt = new cjs.Point(x,y);
        var plexPt2 = this.getComplexPointByData(dataPt, layer, true);

        plexPt1.moveable = false;
        plexPt2.moveable = false;

        returnArr.push(plexPt1, plexPt2);
    };

    return returnArr;
}


//--------------------------------------------------------------------------- addRegression
Graphead.prototype.addRegression = function(dataLayerName, regressionLayerName, regressionType){

    if(this.LAYERS[dataLayerName] == null){ return };
    if(this.LAYERS[regressionLayerName] == null){ return };

    this.REGRESSIONS[regressionLayerName] = [dataLayerName, regressionType]
    this.logAction("addRegression", regressionLayerName);

    this.drawLayer(this.LAYERS[regressionLayerName]);

    this.regressionsExist = true;  
}


//--------------------------------------------------------------------------- plotRegression
// this uses Tom Alexander's regression library, but
// jim fife insists that regressions must extend to grid edges 

Graphead.prototype.plotRegression = function(arr, layer, regressionType){ 

    var formattedArr = formatPlexPointsToArrayPoints(arr);
    var returnArr = [];    

    if(regressionType == "linear"){

        var r = regression("linear", formattedArr);
        r.points.sort(sortRegPointsByX);

        var x = r.points[0][0];
        var y = r.points[0][1];
        var dataPt = new cjs.Point(x,y);
        var plexPt1 = this.getComplexPointByData(dataPt, layer, true);

        var len = (r.points.length - 1);
        var x = r.points[len][0];
        var y = r.points[len][1];
        var dataPt = new cjs.Point(x,y);
        var plexPt2 = this.getComplexPointByData(dataPt, layer, true);
        
        // extropolate using a temporary line, then return the extropolated points
        var tempLine = new ComplexLine(plexPt1, plexPt2, layer, "EXTENDED");
        tempLine = this.extrapolateLine(tempLine);

        returnArr = [tempLine.pt1, tempLine.pt2];

    };

    if(regressionType == "quadratic"){

        formattedArr = this.normalizePoints(formattedArr); // normalize

        var r = regression("polynomial", formattedArr, 2); // 2 = degree of polynomial

        var quadPoints = [];
        for (var i = 0; i < (this.unitsWide + 1); i++) {
            var quadY = (r.equation[2] * Math.pow(i, 2)) + (r.equation[1] * i) + r.equation[0];
            quadPoints.push([i, quadY]);
        }

        quadPoints = plotSmooveCurve(quadPoints);
        quadPoints = this.denormalizePoints(quadPoints); // denormalize

        for(var i=0; i < (quadPoints.length - 1); i++){
            
            var x = quadPoints[i][0];
            var y = quadPoints[i][1];
            var dataPt = new cjs.Point(x,y);
            var plexPt1 = this.getComplexPointByData(dataPt, layer, true);
            
            var x = quadPoints[i+1][0];
            var y = quadPoints[i+1][1];
            var dataPt = new cjs.Point(x,y);
            var plexPt2 = this.getComplexPointByData(dataPt, layer, true);
            
            plexPt1.moveable = false;
            plexPt2.moveable = false;
            
            returnArr.push(plexPt1, plexPt2);
        };
    };


    if(regressionType == "exponential"){

        var r = regression("exponential", formattedArr);

        var expoPoints = [];
        for (var i = 0; i < (this.unitsWide + 1); i++) {
            var expoY = r.equation[0] * Math.pow(2.718, r.equation[1] * i);  // 2.718 = Euler constant
            expoPoints.push([i, expoY]);
        }

        expoPoints = plotSmooveCurve(expoPoints);

        for(var i=0; i < (expoPoints.length - 1); i++){
            
            var x = expoPoints[i][0];
            var y = expoPoints[i][1];
            var dataPt = new cjs.Point(x,y);
            var plexPt1 = this.getComplexPointByData(dataPt, layer, true);
            
            var x = expoPoints[i+1][0];
            var y = expoPoints[i+1][1];
            var dataPt = new cjs.Point(x,y);
            var plexPt2 = this.getComplexPointByData(dataPt, layer, true);
            
            plexPt1.moveable = false;
            plexPt2.moveable = false;
            
            returnArr.push(plexPt1, plexPt2);
        };

    };

    return returnArr;
}


//--------------------------------------------------------------------------- testPointHit
Graphead.prototype.testPointHit = function(){ 

    var stagePt = this.getStagePt()
    var hit = [];

    var All_Points = this.getAllPoints();

    for(var i=0; i < All_Points.length; i++){

        var p = All_Points[i];
        if(p.layer.persist){ continue; };
        if(!p.moveable){ continue; }

        var hitDistance = p.layer.styleObj.size + 4; // 4=tolerance
        
        if(distance(p.coorPt, stagePt) < hitDistance){ hit.push(p); }
    };
    
    if(hit.length > 0){
        return hit[hit.length-1];
    }else{
        return null;
    };
}


//--------------------------------------------------------------------------- testPointOverlap
// test whether a given point overlaps another point on the same layer
Graphead.prototype.testPointOverlap = function(testPt){

    var All_Points = this.getAllDots(testPt.layer.name);

    if(!inArray(testPt, All_Points)){ return false; }

    var hit = false;

    for(var i=0; i < All_Points.length; i++){
        
        var p = All_Points[i];
        if(p == testPt){ continue; };

        var hitDistance = p.layer.styleObj.size; 
        
        if(distance(p.coorPt, testPt.coorPt) < hitDistance){ hit = true;  }
    };

    return hit;
}


//--------------------------------------------------------------------------- verticalLineTest
// for piecewise & curves, 2 points may not be plotted on the same X axis
// (mathematical functions can only have one output y, for input x)
Graphead.prototype.verticalLineTest = function(testPt){

    var hit = false;
    var hitDistance = testPt.layer.styleObj.size;
    var min = testPt.coorPt.x - hitDistance;
    var max = testPt.coorPt.x + hitDistance;

    if(this.PIECEWISE[testPt.layer.name].length){
        for(var i=0; i < this.PIECEWISE[testPt.layer.name].length; i++){
            var p = this.PIECEWISE[testPt.layer.name][i];
            if(p == testPt){ continue; }

            if((p.coorPt.x > min) && (p.coorPt.x < max)){
                hit = true; 
            };

        };
    };

    if(this.CURVES[testPt.layer.name].length){
        for(var i=0; i < this.CURVES[testPt.layer.name].length; i++){
            var p = this.CURVES[testPt.layer.name][i];
            if(p == testPt){ continue; }

            if((p.coorPt.x > min) && (p.coorPt.x < max)){
                hit = true; 
            };

        };
    };

    return hit;
}



//--------------------------------------------------------------------------- startDrag
Graphead.prototype.startDrag = function(pt, log){

    var self = this;
    var originalCoor = clone(pt.coorPt);

    var DRAGGING = function(evt){
        var stagePt = self.getStagePt();
        pt.moveToCoorPt(stagePt);
        self.drawLayers();
    };
    
    var STOP_DRAGGING = function(evt){

        if(self.testPointOverlap(pt)){
            alert(ERROR_MSG_OVERLAP_PLOT);
            pt.moveToCoorPt(originalCoor);
        };

        // for piecewise & curves, 2 points may not be plotted on the same X axis
        // (mathematical functions can only have one output y, for input x)
        if(self.verticalLineTest(pt)){
            alert(ERROR_MSG_VERTICAL_LINE);
            error = true;
            pt.moveToCoorPt(originalCoor);
        };

        // only log if the point was actually moved (not just clicked)
        if( (log == true) &&
            ((pt.coorPt.x != originalCoor.x) ||
             (pt.coorPt.y != originalCoor.y))){
            self.logAction("moveDot", [pt, originalCoor]);
        };

        cjs.Ticker.removeEventListener("tick", DRAGGING);
        cjs.Ticker.setPaused(true);
        self.stage.removeEventListener("stagemouseup", STOP_DRAGGING);
        pt.highlight = false;
        self.drawLayers();
        self.stage.addEventListener("stagemousedown", self.stageClick);
        self.actionInProgress = false;
    };

    this.stage.removeEventListener("stagemousedown", this.testPointHit);

    pt.highlight = true;
    cjs.Ticker.setPaused(false);
    cjs.Ticker.addEventListener("tick", DRAGGING);
    this.stage.addEventListener("stagemouseup", STOP_DRAGGING);
};


//--------------------------------------------------------------------------- getAllPoints
// layerName is optional, but if provided, points will be filtered 
Graphead.prototype.getAllPoints = function(layerName){

    var arr = [];

    for(var i=0; i < this.POINTS.length; i++){
        var p = this.POINTS[i];
        if(layerName){
            if(p.layer.name == layerName){  arr.push(p); };
        }else{
            arr.push(p); 
        };
    };
    
    return arr;
}


//--------------------------------------------------------------------------- getAllDots
// this method returns all points that are not associated with a line or curve or piecewise function
Graphead.prototype.getAllDots = function(onlyFromLayerName){

    var dotsArr = [];
    for(var i=0; i < this.POINTS.length; i++){
        var pt = this.POINTS[i];

        if(onlyFromLayerName){
            if(pt.layer.name != onlyFromLayerName){ continue; };
        };

        var keep = true;
        for(var j in this.LAYERS){
            var layerName = this.LAYERS[j].name;        

            if(inArray(pt, this.getFlattenedLineArray(layerName))){ keep = false; break; }

            if(this.CONNECTIONS[layerName].length > 1){
                if(inArray(pt, this.CONNECTIONS[layerName])){ keep = false; break; }
            };

            if(this.PIECEWISE[layerName].length > 1){
                if(inArray(pt, this.PIECEWISE[layerName])){ keep = false; break; }
            };

            if(this.CURVES[layerName].length > 2){
                if(inArray(pt, this.CURVES[layerName])){ keep = false; break; }  
            };
        };

        if(keep){ dotsArr.push(pt); }
    };

    return dotsArr;
};            


//--------------------------------------------------------------------------- getFlattenedLineArray
Graphead.prototype.getFlattenedLineArray = function(layerName){
    var arr = [];
    for(var i=0; i < this.LINES[layerName].length; i++){
        var l = this.LINES[layerName][i];
        arr.push(l.pt1);
        arr.push(l.pt2);
    };
    return arr;
};


//--------------------------------------------------------------------------- getAllUniqueDataPoints
Graphead.prototype.getAllUniqueDataPoints = function(layerName){

    return removeDuplicateDataPts( this.getAllPoints(layerName) );
};


//--------------------------------------------------------------------------- normalizePoints
// for regressions, this works only on points structured as an array [x,y]
// NOT complex point objects
Graphead.prototype.normalizePoints = function(arr){

    var scaleX = this.grid.get("scaleFactorX");
    var scaleY = this.grid.get("scaleFactorY");

    var newArr = [];

    for(var i=0; i < arr.length; i++){
        var p = arr[i];
        var newX = p[0]/scaleX;
        var newY = p[1]/scaleY;
        newArr.push([newX, newY]);
    };

    return newArr;
};


//--------------------------------------------------------------------------- denormalizePoints
// for regressions, this works only on points structured as an array [x,y]
// NOT complex point objects
Graphead.prototype.denormalizePoints = function(arr){

    var scaleX = this.grid.get("scaleFactorX");
    var scaleY = this.grid.get("scaleFactorY");

    var newArr = [];

    for(var i=0; i < arr.length; i++){
        var p = arr[i];
        var newX = p[0] * scaleX;
        var newY = p[1] * scaleY;
        newArr.push([newX, newY]);
    };

    return newArr;
};


//--------------------------------------------------------------------------- getPointByID
Graphead.prototype.getPointByID = function(id){

    for(var i=0; i < this.POINTS.length; i++){
        if(this.POINTS[i].id == id){ return this.POINTS[i];};
    };
    return false;
};


//--------------------------------------------------------------------------- addTo_POINTS
Graphead.prototype.addTo_POINTS = function(p){

    this.POINTS.push(p);
};


//--------------------------------------------------------------------------- removeFrom_POINTS
// you can pass a single point or an array of points
Graphead.prototype.removeFrom_POINTS = function(p){

    if(isArray(p)){
        for(var i=0; i < p.length; i++){
            var len = this.POINTS.length;
            while (len--) {
                if(this.POINTS[len] == p[i]){ this.POINTS.splice(len,1); };
            };
        };
    }else{
        var len = this.POINTS.length;
        while (len--) {
            if(this.POINTS[len] == p){ this.POINTS.splice(len,1); };
        }
    }
};


//--------------------------------------------------------------------------- setPointLimit
Graphead.prototype.setPointLimit = function(layerName, limit){

    if(this.LAYERS[layerName] == null){ return };
    if(this.LAYERS[layerName].persist){ return };
    this.userPointLimit = {layer:this.LAYERS[layerName], limit:Number(limit)};
};


//--------------------------------------------------------------------------- overPointLimit
Graphead.prototype.overPointLimit = function(){

    if(this.userPointLimit == null){ return false; }; //no limit set
    var layer = this.userPointLimit.layer;
    var limit = this.userPointLimit.limit;

    var count = 0;

    for(var i=0; i < this.POINTS.length; i++){
        var p = this.POINTS[i];
        if(p.layer == layer){ count++ };
    };

    return count >= limit;
};


//--------------------------------------------------------------------------- moveToTop
Graphead.prototype.moveToTop = function(layer){ 

    this.stage.addChildAt(layer, this.stage.getNumChildren()); // change z-index
};


//--------------------------------------------------------------------------- getTopLayer
Graphead.prototype.getTopLayer = function(){ 

    var shape = this.stage.getChildAt(this.stage.getNumChildren() - 1);
    return this.LAYERS[shape.name];
};


//--------------------------------------------------------------------------- getStagePt
Graphead.prototype.getStagePt = function(){ 

    return new cjs.Point(this.stage.mouseX, this.stage.mouseY); 
};


//--------------------------------------------------------------------------- pointIsOnGrid
// this uses easel pts not plexPts
Graphead.prototype.pointIsOnGrid = function(pt){ 

    var tolerance = 20; 

    // Grid Min/Max
    var gridObj = this.grid.getGridObj()
    var gridMinX = gridObj.x - tolerance;
    var gridMaxX = (gridObj.x + this.grid.get("gridWidth")) + tolerance;
    var gridMinY = (gridObj.y) - tolerance;
    var gridMaxY = (gridObj.y + this.grid.get("gridHeight")) + tolerance;

    if((pt.x > gridMinX) &&
       (pt.x < gridMaxX) &&
       (pt.y > gridMinY) &&
       (pt.y < gridMaxY)){
        return true;
    }else{
        return false;
    };
};



//--------------------------------------------------------------------------- addLabelToPoint
Graphead.prototype.addLabelToPoint = function(layerName, point, text){ 

    if(this.LAYERS[layerName] == null){ return };
    var layer = this.LAYERS[layerName];
    var STYLE = layer.styleObj;

    var pointObj;
    if(point instanceof ComplexPoint){
        pointObj = point;
    }else{
        for(var i=0; i < this.POINTS.length; i++){ 
            var pt = this.POINTS[i];
            if(pt.dataPt.x == point.x){
                if(pt.dataPt.y == point.y){  pointObj = pt; break; };
            };
        };
    };

    var txtContainer = new cjs.Container();
    var txt = new cjs.Text(new String(text), new String(STYLE.fontSize) + "px " + STYLE.font, STYLE.fontColor);
    txt.textBaseline = "top";
    txt.textAlign = "left";
    var w = txt.getMeasuredWidth();
    var h = txt.getMeasuredLineHeight();
    
    var txtbg = new cjs.Shape();
    txtbg.graphics.beginFill("#fff");
    txtbg.graphics.rect(0, 0, (w+1), (h+1));
    txtbg.graphics.endFill();
    
    txtContainer.addChild(txtbg);
    txtContainer.addChild(txt);
    txtContainer.visible = false;
    txtContainer.labelStr = new String(text);
    txtContainer.h = h;

    layer.addChild(txtContainer);

    pointObj.label = txtContainer;

    this.drawLayer(layer);
};


//--------------------------------------------------------------------------- removeLabel
Graphead.prototype.removeLabel = function(point){ 

    point.layer.removeChild(point.label);
    point.label = null;
    this.drawLayer(point.layer);
}


//--------------------------------------------------------------------------- swapLabel
Graphead.prototype.swapLabel = function(pt1, pt2){ 

    pt2.label = pt1.label;
    pt1.label = null;
}


//--------------------------------------------------------------------------- customText
// this allows you to add text anywhere on the canvas
// although it takes a layer name as a parameter, the layer is used for
// style properties only, the actual object is added to the stage
// internally a layer is a cjs.Shape
Graphead.prototype.customText = function(text, layerName, globalPosition){ 

    if(this.LAYERS[layerName] == null){ return };
    var layer = this.LAYERS[layerName];
    var STYLE = layer.styleObj;

    var txt = new cjs.Text(new String(text), new String(STYLE.fontSize) + "px " + STYLE.font, STYLE.fontColor);
    txt.textBaseline = "top";
    txt.textAlign = "left";

    txt.x = globalPosition.x;
    txt.y = globalPosition.y;
    this.stage.addChild(txt);
}


//--------------------------------------------------------------------------- logAction
Graphead.prototype.logAction = function(type, data){ 

    this.UNDOstack.push({type:type, data:data});
}


//--------------------------------------------------------------------------- undo
Graphead.prototype.undo = function(){ 
    
    if(this.UNDOstack.length < 1){ return; };

    var action = this.UNDOstack.pop();

    switch(action.type){

    case "addDot":
        this.removeDot(action.data);
        break;

    case "moveDot":
        var dot = action.data[0];
        var coorPt = action.data[1];
        dot.moveToCoorPt(coorPt);
        this.drawLayers();
        break;

    case "addLine":
        var line = action.data;
        var layer = line.layer;
        this.removeLine(line);
        break;

    case "addPiecewisePt":
        var pt = action.data;
        var layerName = pt.layer.name;
        removeFromArr(pt, this.PIECEWISE[layerName]);
        this.removeDot(pt);
        break;

    case "addConnectedPt":
        var pt = action.data;
        var layerName = pt.layer.name;
        this.CONNECTIONS[layerName].pop();
        if(pt.label && this.CONNECTIONS[layerName].length){
            var pt2 = this.CONNECTIONS[layerName][(this.CONNECTIONS[layerName].length - 1)];
            this.swapLabel(pt, pt2);
        };
        this.removeDot(pt);
        break;

    case "addCurve":
        this.CURVES[action.data] = [];
        this.drawLayer(this.LAYERS[action.data]);
        break;

    case "clickCurve":
        var curveAction = this.UNDOstack.pop();
        var dotAction   = this.UNDOstack.pop();
        this.removeDot(dotAction.data);
        this.addCurve(action.data, action.data); // this will log again, so pop immediately
        this.UNDOstack.pop(); 
        this.drawLayer(this.LAYERS[action.data]);
        break;

    case "addRegression":
        this.REGRESSIONS[action.data] = [];
        this.drawLayer(this.LAYERS[action.data]);
        break;

    default:
    };
}


//--------------------------------------------------------------------------- startOver
Graphead.prototype.startOver = function(){ 

    this.disableClickAction();

    // note: we can't loop through the POINT array while using removeDot
    // because removeDOT itself loops through POINT, so instead create a temp array
    var removeArr = [];

    for(var i=0; i < this.POINTS.length; i++){ 
        var pt = this.POINTS[i];
        if(pt.layer.persist != true){ removeArr.push(pt); };
    }

    for(var i=0; i < removeArr.length; i++){  this.removeDot(removeArr[i]);  };

    for(var i in this.LAYERS){
        var lay = this.LAYERS[i];

        if(lay.persist != true){ 

            // remove EXTENDED line labels
            for(var j=0; j < this.LINES[lay.name].length; j++){
                if(this.LINES[lay.name][j].labelPt){
                    this.removeLabel(this.LINES[lay.name][j].labelPt);
                };
            };

            this.LINES[lay.name]       = [];  
            this.CONNECTIONS[lay.name] = [];  
            this.PIECEWISE[lay.name]   = [];  
            this.CURVES[lay.name]      = [];  
            this.REGRESSIONS[lay.name] = [];  
        };
    };

    this.drawLayers();
    this.stage.update();

    this.UNDOstack = [];
}


//--------------------------------------------------------------------------- cleanUp
Graphead.prototype.cleanUp = function(){ 

    cjs.Ticker.setFPS(0);
    if(this.touch){ cjs.Touch.disable(this.stage); };

    this.stage.removeAllChildren();
    this.stage.removeAllEventListeners();
    this.stage.enableMouseOver(0);  
    this.stage.enableDOMEvents(false);
    this.stage.uncache();
    this.stage = null;

    this.LAYERS      = null;
    this.POINTS      = null;
    this.LINES       = null;
    this.CONNECTIONS = null;
    this.PIECEWISE   = null;
    this.CURVES      = null;
    this.REGRESSIONS = null;

    this.grid.uncache();
    this.grid = null;

    this.canvasID = null;
    this.canvas = null;
}


//--------------------------------------------------------------------------- getData
Graphead.prototype.getData = function(){ 

    // Note: most of our data contain Easel objects, which, can't be serialized  

    // POINTS
    var pointInfo = [];
    for(var i=0; i < this.POINTS.length; i++){
        var pt = this.POINTS[i];
        var labelStr = null;
        if(pt.label){ labelStr = pt.label.labelStr; }
        pointInfo.push([pt.coorPt, pt.layer.name, pt.id, labelStr]);
    };
    pointInfo = JSON.stringify(pointInfo);

    // LINES
    var lineInfo = [];
    for(var i in this.LAYERS){
        var layerName = this.LAYERS[i].name;
        for(var j=0; j < this.LINES[layerName].length; j++){
            var l = this.LINES[layerName][j];
            lineInfo.push([l.pt1.id, l.pt2.id, l.lineType, l.layer.name]);
        }
    };
    lineInfo = JSON.stringify(lineInfo);

    // little algorithm for serializing just the IDs of points in these collections
    // -----------------------------
    var self = this;
    function serializePointArrayForAllLayers(A){
        var arr = [];
        for(var i in self.LAYERS){
            var layerName = self.LAYERS[i].name;
            var IDS = [];
            for(var j=0; j < A[layerName].length; j++){
                var pointID = A[layerName][j].id;
                IDS.push(pointID);
            };
            arr.push({layerName:layerName, pointIDs:IDS});
        };
        return JSON.stringify(arr);
    };   // -----------------------------
    
    var piecewiseInfo   = serializePointArrayForAllLayers(this.PIECEWISE);
    var connectionsInfo = serializePointArrayForAllLayers(this.CONNECTIONS);
    var curvesInfo      = serializePointArrayForAllLayers(this.CURVES);  


    // This code captures all the initialization settings 
    // We'll want this for VIA 

    var canvasID = this.canvasID;
    var gridStyleInfo = JSON.stringify(this.style);
    
    var layerInfo = [];
    for(var i in this.LAYERS){
        var layerName = this.LAYERS[i].name;
        var persist   = this.LAYERS[i].persist;
        var styleObj  = this.LAYERS[i].styleObj;
        layerInfo.push({layerName:layerName, persist:persist, styleObj:styleObj});
    };
    layerInfo = JSON.stringify(layerInfo);

    
    var everything = "";
    everything += canvasID        + "~";
    everything += itemID          + "~";
    everything += gridStyleInfo   + "~";
    everything += layerInfo       + "~";
    everything += pointInfo       + "~";
    everything += lineInfo        + "~";
    everything += piecewiseInfo   + "~";
    everything += connectionsInfo + "~";
    everything += curvesInfo      

    return everything;
}


//--------------------------------------------------------------------------- setData
Graphead.prototype.setData = function(d){ 

    var everything = d.split("~");

    var canvasID        = everything[0];             
    var itemID          = everything[1];             
    var gridStyleInfo   = JSON.parse(everything[2]); // for VIA 
    var layerInfo       = JSON.parse(everything[3]); // for VIA 

    var pointInfo       = JSON.parse(everything[4]);
    var lineInfo        = JSON.parse(everything[5]);
    var piecewiseInfo   = JSON.parse(everything[6]);
    var connectionsInfo = JSON.parse(everything[7]);
    var curvesInfo      = JSON.parse(everything[8]);

    // POINTS
    for(var i=0; i < pointInfo.length; i++){
        var p = pointInfo[i];
        var coorPt    = p[0];
        var layerName = p[1];
        var id        = p[2];
        var labelStr  = p[3];

        var layer = this.LAYERS[layerName];
        if(layer.persist){ continue; }; // don't restore persist layers, they need to be initialized seperately
        var plexPt = this.getComplexPointByCoor(coorPt, layer);
        plexPt.id = id;

        this.addTo_POINTS(plexPt);
        if(labelStr){ this.addLabelToPoint(layerName, plexPt, labelStr); };
    }

    // LINES
    for(var i=0; i < lineInfo.length; i++){
        var l = lineInfo[i];
        var pt1_id    = l[0];
        var pt2_id    = l[1];
        var lineType  = l[2];
        var layerName = l[3];
        var layer   = this.LAYERS[layerName];
        var plexPt1 = this.getPointByID(pt1_id);
        var plexPt2 = this.getPointByID(pt2_id);

        this.LINES[layer.name].push(new ComplexLine(plexPt1, plexPt2, layer, lineType));
    }
    
    // little alogrithm for re-building the hash tables from the serial data
    // -----------------------------
    var self = this;
    function rebuildHashByLayer(hash, data){
        for(var i=0; i < data.length; i++){
            var layerName = data[i].layerName;
            var pointIDs = data[i].pointIDs;
            var arr = [];
            for(var j=0; j < pointIDs.length; j++){
                arr.push(self.getPointByID(pointIDs[j]));
            };
            hash[layerName] = arr;
        };};// -----------------------------
    

    rebuildHashByLayer(this.PIECEWISE, piecewiseInfo);
    rebuildHashByLayer(this.CONNECTIONS, connectionsInfo);
    rebuildHashByLayer(this.CURVES, curvesInfo);

    this.drawLayers();
}


//--------------------------------------------------------------------------- getResponseImageData
// this method is for rebuilding a graph based on the information from getData
// this is different from setData, which, assumes the graph has already been
// created, this is primarily for VIA, it restores the graph then calls setData 
// a canvas ID is required because VIA may display many items at once
// Finally, it creates an image from the canvas data and returns it
Graphead.prototype.getResponseImageData = function(canvasID, everythingString){ 
    
    var everything = everythingString.split("~");

    var itemID        = everything[1]; 
    var gridStyleInfo = JSON.parse(everything[2]);
    var layerInfo     = JSON.parse(everything[3]);

    // init
    this.init(canvasID, itemID, gridStyleInfo);

    // create layers
    for(var i=0; i < layerInfo.length; i++){
        var l = layerInfo[i];
        this.addLayer([], l.layerName, l.persist, l.styleObj);
    };

    // setData
    this.setData(everythingString);

    // get image
    var imageData = this.canvas.toDataURL();

    this.cleanUp(); // do the right thing

    return imageData;
}


//--------------------------------------------------------------------------- strokeShape
// this encapsulates the drawing instructions for a point
function strokeShape(g, shape, x, y, style, size){
    
    g.setStrokeStyle(style.strokeSize)
        .beginStroke(style.color)
        .beginFill(style.fill);
    
    switch(shape){
    case "circle": g.drawCircle(x, y, (size/2)); 
        break;
    case "square": g.rect((x - (size/2)), (y - (size/2)), size, size);
        break;
    };

    g.endStroke();
    g.endFill();
}


//--------------------------------------------------------------------------- isArray
function isArray(o) {    
    // determine if object is array

    return Object.prototype.toString.call(o) === '[object Array]';
}


//--------------------------------------------------------------------------- inArray
function inArray(o, arr) {    

    for(var i=0; i < arr.length; i++){
        if(arr[i] == o){ return true; };
    };
    return false;
}


//--------------------------------------------------------------------------- removeFromArr
function removeFromArr(obj, arr) {   
    // remove an object from an array

    for (var i=0,l=arr.length; i<l; i++) {
        if (arr[i] == obj) { arr.splice(i,1); };
    }
}


//--------------------------------------------------------------------------- clone
// simple clone via JSON serialization
function clone(obj) {    

    return JSON.parse(JSON.stringify(obj));
}


//--------------------------------------------------------------------------- distance
// distance between 2 points via pythagoras
function distance(pt1, pt2) {  

    return Math.sqrt(Math.pow((pt1.x - pt2.x), 2) + Math.pow((pt1.y - pt2.y), 2));
}


//--------------------------------------------------------------------------- sortByZIndex
function sortByZIndex(pt1, pt2){

    if(pt1.zIndex > pt2.zIndex){
        return -1;
    }else{
        return 1;
    };
    return 0;
}


//--------------------------------------------------------------------------- sortByX
// this sort works on plexPoints coordinates
function sortByX(pt1, pt2){

    if(pt1.coorPt.x < pt2.coorPt.x){
        return -1;
    }else if(pt1.coorPt.x > pt2.coorPt.x){
        return 1;
    }else{
        if(pt1.coorPt.y < pt2.coorPt.y){
            return -1;
        }else if(pt1.coorPt.y > pt2.coorPt.y){
            return 1;
        }else{ return 0 };
    };
}


//--------------------------------------------------------------------------- sortRegPointsByX
// this sorts on 'regression.js' points, which, are arrays
// sorts by x, if x is the same, then it sorts by y
function sortRegPointsByX(pt1, pt2){

    if(pt1[0] < pt2[0]){
        return -1;
    }else if(pt1[0] > pt2[0]){
        return 1;
    }else{
        if(pt1[1] < pt2[1]){
            return -1;
        }else if(pt1[1] > pt2[1]){
            return 1;
        }else{ return 0 };
    };
}


//--------------------------------------------------------------------------- removeDuplicateDataPts
// given an array of Complex Points, I removed duplicates based on their data point
function removeDuplicateDataPts(arr){  

    var hash = {};
    var returnArr = [];

    for(var i=0; i < arr.length; i++){
        var key = arr[i].dataPt.x + "." + arr[i].dataPt.y;
        if(hash[key]){ continue; };
        returnArr.push(arr[i]);
        hash[key] = 1;
    };

    return returnArr;
}


//--------------------------------------------------------------------------- formatPlexPointsToArrayPoints
// given an array of Complex Points, I return the data points as [x, y]
function formatPlexPointsToArrayPoints(arr){

    var formattedArr = [];
    for(var i=0; i < arr.length; i++){
        formattedArr.push([arr[i].dataPt.x, arr[i].dataPt.y]);
    }

    return formattedArr;
}


//--------------------------------------------------------------------------- getSlope
// using coordinate points
function getSlope(A, B){
    return (B.coorPt.y - A.coorPt.y)/(B.coorPt.x - A.coorPt.x);
}


//--------------------------------------------------------------------------- plotSmooveCurve
/*
  Originally: PlotCurve.java, by Keith Kiser 8/2012
  Computes a set of points to draw a smooth curve between two points
  based on equations by Jim Fife
  javascript version 2014
  plotCurve expects a sorted array of points, where points are 2 element arrays: [x, y]
  the array should be sorted by x
*/
function plotSmooveCurve(sortedPointsArr) {

    var points = sortedPointsArr;
    var n = points.length - 1;

    var curve  = [];
    var slopes = [];
    var h      = [];
    var k      = [];

    slopes[0] = -1; // unused
    
    for(var i=1; i <= n; i++) {
        h[i] = points[i][0] - points[i-1][0];
        k[i] = points[i][1] - points[i-1][1];
        var slope = k[i]/h[i];
        if(!isFinite(slope)){ slope = 0; }; // check that we didn't divide by zero
        slopes[i] = slope;
        //  console.log( "k", k[i], "h", h[i], "k[i]/h[i]", k[i]/h[i], slopes[i]);
    };
    
    /*
      calculate 'm' which is the slope at point on the curve, using the harmonic mean
      if s[i]*s[i+1] > 0 then m = (2*s[i]*s[i+1])/(s[i] + s[i+1]
      if s[i]*s[i+1] <= 0 then m = 0
    */
    
    var m = [];
    for (var i = 1; i <= (n -1); i++) {
        if ((slopes[i] * slopes[i+1]) > 0) {
            m[i] = (2 *(slopes[i] * slopes[i+1]))/ (slopes[i] + slopes[i+1]);
        } else {
            m[i] = 0;
        }
    }
    m[0] = 2*slopes[1] - m[1];
    m[n] = 2*slopes[n] - m[n -1];
    
    /*
      calculate y' for some x' such that x[i-1] <= x  <= x[i]
      a[i] = y[i-1]
      b[i] = m[i-1]
      c[i] = (3*s[i] - 2*m[i-1] - m[i])/h[i]
      d[i] = (m[i-1] + m[i] -2*s[i])/h[i]^2
      
      The polynomial is a + b *(x - x(i-1)) + c *(x-x(i-1))^2 + d*(x - x(i-1))^3
      this gives us a set of y values for each x. x is increment in .1 steps
      
      The initial x and y values above were used to calculate the a,b,c,d for the equations below
    */
    
    var step = 0.1;
    
    for (var i = 1; i <= n; i++) {
        
        var a = points[i-1][1];
        var b = m[i-1];
        var c = ((3 * slopes[i]) - (2 * m[i-1]) - m[i])/h[i];
        var d = (m[i-1] + m[i] - (2 * slopes[i]))/(h[i] * h[i]);
        
        var lastendpoint = points[i][0];
        var currentX     = points[i-1][0];
        var newX         = currentX + step;
        var firstAdded   = false;
        
        //console.log ("Starting point (" + points[i-1][0] + "," + points[i-1][1]+")");
        
        if (firstAdded == false) {
            // add starting point to curve
            curve.push(points[i-1]);
            firstAdded = true;
        }
        
        while (newX < lastendpoint) {
            // calculate y coords
            var y; // y = f(x)
            var tmp = newX - currentX;
            y = a + (b * tmp) + (c * Math.pow(tmp, 2)) + (d * Math.pow(tmp, 3));
            
            var p = [newX, y];
            curve.push(p); // console.log(p);

            newX += step; //currentX = newX;
        }
        
        // add ending point to curve
        curve.push(points[i]);
    }
    
    return curve;
}

