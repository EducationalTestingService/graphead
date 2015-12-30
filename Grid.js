
// Grid
// REQUIRES: easeljs

// i build a grid typically for a graph's background
// i have some sensible defaults, but i am eminently customizable
// read my constructor to see all my parameters
// pass my constructor a style object to override them
// author: jason bonthron

//--------------------------------------------------------------------------- Grid
function Grid(canvas, w, h, size, styleObj){

    this.canvas      = canvas;
    this.canvasW     = this.canvas.width;
    this.canvasH     = this.canvas.height;
    this.cacheWidth  = this.canvasW;
    this.cacheHeight = this.canvasH;

    this.GLOBAL_OFFSET_X = 10; // global padding
    this.GLOBAL_OFFSET_Y = 15; 

    this.unitSize  = size;   // display size of each square
    this.unitSizeX = size; 
    this.unitSizeY = size;

    this.unitsWide = w;
    this.unitsHigh = h;

    this.font = "Arial";
    this.fontSize = 12;
    this.fontColor = "#000000";

    this.scaleFactorX = 1;
    this.scaleFactorY = 1;
    this.decimalX = 0;
    this.decimalY = 0;

    this.scaleStartX = 0;
    this.scaleStartY = 0;

    this.originoffsetX = 0;
    this.originoffsetY = 0;
    this.originoffsetZero = false;  // draw "0" when using quadrant display

    this.arrowheadPosX = false;
    this.arrowheadPosY = false;
    this.arrowheadNegX = false;
    this.arrowheadNegY = false;

    this.unitLabelX = "";
    this.unitLabelY = "";

    this.labelIntervalX = 1;
    this.labelIntervalY = 1;

    this.customLabelsX = [];
    this.customLabelsY = [];

    this.bgColor = "#ffffff";
    this.lineColor = "#cccccc";
    this.originLineColor = "#000000";
    this.outlineColor = "#000000";
    this.strokeStyle = 0;
    this.labelBgColor = "#ffffff";

    this.labelSpacing = 5;

    this.useLabelsX = true;
    this.useLabelsY = true;
    this.useBG      = true;
    this.useOutline = true;
    this.useAxisX   = true;
    this.useAxisY   = true;
    this.useOrigin  = true;

    this.axisTitleX = "";
    this.axisTitleY = "";

    this.layout = ""; 

    if(styleObj){
        for(var i in styleObj){
            if(this[i] != null){ this[i] = styleObj[i];};
        };
    };

    if(this.originoffsetX){ this.scaleStartX -= (this.originoffsetX * this.scaleFactorX); };
    if(this.originoffsetY){ this.scaleStartY -= (this.originoffsetY * this.scaleFactorY); };
    this.quadrant = false;
    if(this.originoffsetX || this.originoffsetY){ this.quadrant = true; }

    if(this.axisTitleX != ""){ this.useAxisTitleX = true; }
    if(this.axisTitleY != ""){ this.useAxisTitleY = true; }

    if(this.arrowheadPosX || this.arrowheadPosY || this.arrowheadNegX || this.arrowheadNegY){ this.useArrowheads = true; }

    this.gridWidth  = (this.unitsWide * this.unitSizeX);
    this.gridHeight = (this.unitsHigh * this.unitSizeY);


    this.assemble(); // put all the pieces together

    // we return Easel's container obj, so we'll add some custom methods to it...
    var self = this;
    var origin = new cjs.Point(this.gridShape.x, (this.gridShape.y + this.gridHeight));

    this.gridContainer.getOriginPt = function() { return origin; };
    this.gridContainer.getGridObj = function() { return self.gridShape; };
    this.gridContainer.get = function(propertyName){ return self[propertyName]; }

    return this.gridContainer;
}


//--------------------------------------------------------------------------- assemble
Grid.prototype.assemble = function(){

    this.gridContainer = new cjs.Container();

    this.drawGridShape();

    // write the labels, 
    // they must be created before they can be positioned because
    // we need to measure the size of the text

    if(this.useLabelsY){ var y_labels = this.drawY_labels(); this.y_labels = y_labels; };
    if(this.useLabelsX){ var x_labels = this.drawX_labels(); this.x_labels = x_labels; };

    if(this.useAxisTitleX){ var x_axisTitle = this.drawAxisTitleX(); this.x_axisTitle = x_axisTitle; };
    if(this.useAxisTitleY){ var y_axisTitle = this.drawAxisTitleY(); this.y_axisTitle = y_axisTitle; };

    if(this.useArrowheads){ this.drawArrowheads(); }

    // then, each object knows how to position itself...
    this.gridShape.pos();

    if(this.useLabelsY){  y_labels.pos(); };
    if(this.useLabelsX){  x_labels.pos(); };
    if(this.quadrant && this.originoffsetZero){ this.drawQuadrantZero(); }

    if(this.useArrowheads){ this.positionArrowheads(); }

    if(this.useAxisTitleX){  x_axisTitle.pos(); };
    if(this.useAxisTitleY){  y_axisTitle.pos(); };

    this.gridContainer.x = .5;
    this.gridContainer.y = .5;
    this.gridContainer.cache(.5, .5, this.cacheWidth, this.cacheHeight, 2); // cache!

    this.gridContainer.width  = this.cacheWidth;
    this.gridContainer.height = this.cacheHeight;
}


//--------------------------------------------------------------------------- drawGridShape
Grid.prototype.drawGridShape = function(){

    this.gridShape = new cjs.Shape();
    this.g = this.graphics = this.gridShape.graphics;  // g

    // draw the actual grid shape
    if(this.useBG)     { this.drawBG(); };
    if(this.useAxisX)  { this.drawXlines(); };
    if(this.useAxisY)  { this.drawYlines(); };
    if(this.useOutline){ this.drawOutline(); };
    if(this.useOrigin) { this.drawOrigin(); };

    this.gridContainer.addChild(this.gridShape);

    // ------------------------------------- pos    
    var self = this;
    this.gridShape.pos = function(){
        
        this.x = self.GLOBAL_OFFSET_X;    
        var wider = 0; 
        if(self.useLabelsX){
            if(self.x_labels.su > wider){ wider = self.x_labels.su; }
        };
        if(self.useLabelsY){
            if((self.y_labels.wu + self.labelSpacing) > wider){ wider = (self.y_labels.wu + self.labelSpacing); }
        };
        this.x += wider;
        if(self.useAxisTitleY){ this.x += (self.fontSize + (2 * self.labelSpacing)); };
        this.x = Math.floor(this.x);

        this.y = self.GLOBAL_OFFSET_Y;    
        if(self.useLabelsY){ this.y += (self.fontSize/2); };
        this.y = Math.floor(this.y);
    }
}


//--------------------------------------------------------------------------- drawBG
Grid.prototype.drawBG = function(){

    this.g.moveTo(0,0)
        .beginFill(this.bgColor)
        .rect(0,0,this.gridWidth, this.gridHeight)
        .endFill();
};


//--------------------------------------------------------------------------- drawOutline
Grid.prototype.drawOutline = function(){

    this.g.moveTo(0,0)
        .beginStroke(this.outlineColor)
        .rect(0,0,this.gridWidth,this.gridHeight)
        .endStroke();
};


//--------------------------------------------------------------------------- drawXlines
Grid.prototype.drawXlines = function(){

    this.g.moveTo(0,0);
    this.g.setStrokeStyle(this.strokeStyle);

    for(var i=0; i <= this.unitsWide; i++){
        this.g.beginStroke(this.lineColor)
            .moveTo((i * this.unitSizeX), this.gridHeight)
            .lineTo((i * this.unitSizeX), 0)
            .endStroke();
    };    
};


//--------------------------------------------------------------------------- drawYlines
Grid.prototype.drawYlines = function(){

    this.g.moveTo(0,0);
    this.g.setStrokeStyle(this.strokeStyle);

    for(var i=0; i <= this.unitsHigh; i++){
        this.g.beginStroke(this.lineColor)
            .moveTo(0, (i * this.unitSizeY))
            .lineTo(this.gridWidth, (i * this.unitSizeY))
            .endStroke();
    };
};


//--------------------------------------------------------------------------- drawOrigin
Grid.prototype.drawOrigin = function(){

    if(this.useAxisX) {  
        if(this.quadrant || this.scaleStartX == 0){
            this.g.moveTo((this.originoffsetX * this.unitSizeX), this.gridHeight)
                .beginStroke(this.originLineColor)
                .lineTo((this.originoffsetX * this.unitSizeX), 0)
                .endStroke();
        }else{
            // note: this only applies if scale starts below zero
            // also: test that zero will appear: scaleStartX % scaleFactorX == 0
            if((this.scaleStartX < 0) && ((this.scaleStartX % this.scaleFactorX) == 0)){
                var ogn = ((Math.abs(this.scaleStartX)/this.scaleFactorX) * this.unitSizeX);
                this.g.moveTo(ogn, this.gridHeight)
                    .beginStroke(this.originLineColor)
                    .lineTo(ogn, 0)
                    .endStroke();
            };
        };
    };

    if(this.useAxisY) {  
        if(this.quadrant || this.scaleStartY == 0){
            this.g.moveTo(0, ((this.unitsHigh - this.originoffsetY) * this.unitSizeY))
                .beginStroke(this.originLineColor)
                .lineTo(this.gridWidth, ((this.unitsHigh - this.originoffsetY) * this.unitSizeY))
                .endStroke();
        }else{
            // note: this only applies if scale starts below zero
            // also: test that zero will appear: scaleStartY % scaleFactorY == 0
            if((this.scaleStartY < 0) && ((this.scaleStartY % this.scaleFactorY) == 0)){
                var ogn = this.gridHeight - ((Math.abs(this.scaleStartY)/this.scaleFactorY) * this.unitSizeY);
                this.g.moveTo(0, ogn)
                    .beginStroke(this.originLineColor)
                    .lineTo(this.gridWidth, ogn)
                    .endStroke();
            };
        };
    };
};


//--------------------------------------------------------------------------- drawX_labels
Grid.prototype.drawX_labels = function(){

    var Xcontainer = new cjs.Container();
    var Xwidest = 0;

    for(var i=0; i <= this.unitsWide; i++){

        if((i > 0) && ((i % this.labelIntervalX) != 0)) { continue; };

        var val = this.scaleStartX + (this.scaleFactorX * i);
        val = RoundFixed(val, this.decimalX) ;

        if(this.quadrant && val == 0){ val = "";  }

        if(this.customLabelsX.length > 0){  // custom text labels
            if(this.customLabelsX[i]){
                val = this.customLabelsX[i];
            }else{
                val = "";
            };
        };

        var txt = new cjs.Text(new String(val + this.unitLabelX), new String(this.fontSize) + "px " + this.font, this.fontColor);
        txt.textBaseline = "top";
        txt.textAlign = "center";

        var w = txt.getMeasuredWidth();
        var h = txt.getMeasuredLineHeight();

        txt.w = w;  // attach w & h as properties
        txt.h = h;

        txt.x = Math.floor(i * this.unitSizeX);
        txt.y = 0;

        if(w > Xwidest){ Xwidest = w; };
        if(i == 0){ Xcontainer.su = Math.floor(txt.w); }; //su = start unit width
    
        var txtbg = new cjs.Shape();
        txtbg.graphics.beginFill(this.labelBgColor);
        txtbg.graphics.rect(txt.x - (w/2), (txt.y - 1), w, (h + 1));
        txtbg.graphics.endFill();

        Xcontainer.addChild(txtbg);
        Xcontainer.addChild(txt);
    };

    Xcontainer.wu = Math.ceil(Xwidest); //wu = widest unit width


    // ------------------------------------- pos    
    var self = this;
    Xcontainer.pos = function(){
        
        this.x = self.GLOBAL_OFFSET_X;    

        var wider = this.su; 
        if(self.useLabelsY){
            if((self.y_labels.wu + self.labelSpacing) > wider){ wider = (self.y_labels.wu + self.labelSpacing); }
        };   
        this.x += wider;
        if(self.useAxisTitleY){ this.x += (self.fontSize + (2 * self.labelSpacing)); };      
        this.x = Math.floor(this.x);
        
        this.y = self.GLOBAL_OFFSET_Y;    
        this.y += (self.gridHeight - (self.originoffsetY * self.unitSizeY) + self.labelSpacing);
        if(self.useLabelsY){ this.y += (self.fontSize/2); };
        this.y = Math.floor(this.y);
    };
    
    return this.gridContainer.addChild(Xcontainer); 
};


//--------------------------------------------------------------------------- drawY_labels
Grid.prototype.drawY_labels = function(){

    var allLabels = [];
    var allBGs = [];
    var Ywidest = 0;

    var Ycontainer = new cjs.Container();

    for(var i=0; i <= this.unitsHigh; i++){

        if((i > 0) && ((i % this.labelIntervalY) != 0)) { continue; };

        var val = this.scaleStartY + (this.scaleFactorY * (this.unitsHigh - i));
        val = RoundFixed(val, this.decimalY) ;

        if(this.quadrant && val == 0){  val = "";  }

        if(this.customLabelsY.length > 0){  // custom text labels
            if(this.customLabelsY[i]){
                val = this.customLabelsY[i];
            }else{
                val = "";
            };
        };

        var txt = new cjs.Text(new String(val + this.unitLabelY), new String(this.fontSize) + "px " + this.font, this.fontColor);

        txt.textBaseline = "top";  // also, see webkit hack below
        txt.textAlign = "right";

        var w = txt.getMeasuredWidth();
        var h = txt.getMeasuredLineHeight();

        txt.w = w;  // attach w & h as properties
        txt.h = h;

        txt.x = 0;
        txt.y += (i * this.unitSizeY);
        txt.y -= Math.floor(h/2);
        txt.y = Math.floor(txt.y);

        if(w > Ywidest){ Ywidest = w; };

        var txtbg = new cjs.Shape();
        txtbg.graphics.beginFill(this.labelBgColor);
        txtbg.graphics.rect((txt.x - w), txt.y, w, h);
        txtbg.graphics.endFill();

        Ycontainer.addChild(txtbg);
        Ycontainer.addChild(txt);
        allLabels.push(txt);
        allBGs.push(txtbg);
    };
    
    Ywidest = Math.ceil(Ywidest);

    for(var i=0; i < allLabels.length; i++){
        allLabels[i].x += Ywidest;
        allBGs[i].x += Ywidest;
    };
    
    Ycontainer.wu = Ywidest;


    // ------------------------------------- pos    
    var self = this;
    Ycontainer.pos = function(){
        this.x = self.GLOBAL_OFFSET_X;    
        this.x += (self.originoffsetX * self.unitSizeX);
        if(self.useAxisTitleY){ this.x += (self.fontSize + (2 * self.labelSpacing)); };      
        this.x = Math.floor(this.x);

        this.y = self.GLOBAL_OFFSET_Y;
        this.y += (self.fontSize/2);

        // July 2014
        // at the present time, webkit renders "textBaseline" differently than FF or IE
        // although only a pixel or two, it affects where numbers lie on the Yaxis
        // there is a bug in bugzilla: 737852 regarding this, but IE appears to follow FF
        var iswebkit = ('WebkitAppearance' in document.documentElement.style);
        if(iswebkit){ this.y -= 2; };

        this.y = Math.floor(this.y);
    };

    return this.gridContainer.addChild(Ycontainer); 
};


//--------------------------------------------------------------------------- drawAxisTitleX
Grid.prototype.drawAxisTitleX = function(){

    var axisTitleCont = new cjs.Container();

    var txt = new cjs.Text(this.axisTitleX, new String(this.fontSize) + "px " + this.font, this.fontColor);
    txt.textBaseline = "top";
    txt.textAlign = "center";
    
    var w = txt.getMeasuredWidth();
    var h = txt.getMeasuredLineHeight();
    
    axisTitleCont.w = w;
    axisTitleCont.h = h;
    axisTitleCont.addChild(txt);

    // ------------------------------------- pos
    var self = this;
    axisTitleCont.pos = function(){
        this.x = self.GLOBAL_OFFSET_X;
        this.x += self.gridWidth/2;
        if(self.useAxisTitleY){ this.x += (self.fontSize + self.labelSpacing); };      
        if(self.useLabelsY){ this.x += (self.y_labels.wu + self.labelSpacing); };
        this.x = Math.floor(this.x);

        this.y = self.GLOBAL_OFFSET_Y;
        this.y += (self.gridHeight + self.labelSpacing);
        if(self.useLabelsX){ this.y += (self.fontSize + self.labelSpacing); };
        if(self.useLabelsY){ this.y += (self.fontSize/2); };
        this.y = Math.floor(this.y);
    }

    return this.gridContainer.addChild(axisTitleCont);
}


//--------------------------------------------------------------------------- drawAxisTitleY
Grid.prototype.drawAxisTitleY = function(){

    var axisTitleCont = new cjs.Container();

    var txt = new cjs.Text(this.axisTitleY, new String(this.fontSize) + "px " + this.font, this.fontColor);
    txt.textBaseline = "top";
    txt.textAlign = "center";
    
    var w = txt.getMeasuredWidth();
    var h = txt.getMeasuredLineHeight();
    
    axisTitleCont.w = w;
    axisTitleCont.h = h;
    axisTitleCont.addChild(txt);

    // ------------------------------------- pos
    var self = this;
    axisTitleCont.pos = function(){
        this.rotation = -90;
        this.x = self.GLOBAL_OFFSET_X;
        this.y = self.GLOBAL_OFFSET_Y;
        this.y += (self.gridHeight/2);
        if(self.useLabelsY){ this.y += (self.fontSize/2); };
        this.y = Math.floor(this.y);
    }

    return this.gridContainer.addChild(axisTitleCont);
}


//--------------------------------------------------------------------------- drawQuadrantZero
Grid.prototype.drawQuadrantZero = function(){
    var origin = new cjs.Point(this.gridShape.x + (this.originoffsetX * this.unitSizeX), ((this.gridShape.y + this.gridHeight) - (this.originoffsetY * this.unitSizeY) ));

    var txt = new cjs.Text("0", new String(this.fontSize) + "px " + this.font, this.fontColor);
    txt.textBaseline = "top";
    txt.textAlign = "right";
    txt.x = origin.x - 2;
    txt.y = origin.y + 2;
    this.gridContainer.addChild(txt);
}


//--------------------------------------------------------------------------- drawArrowheads
Grid.prototype.drawArrowheads = function(){

    var arrow = new cjs.Shape();
    arrow.graphics.moveTo(0,0)
        .beginStroke(this.originLineColor)
        .lineTo(10,0)
        .endStroke()
        .beginFill(this.originLineColor)
        .drawPolyStar(10,0,5,3,0,0)
        .endFill();


    if(this.arrowheadPosX){
        this.arrowPosX = new cjs.Shape(arrow.graphics);
        this.gridContainer.addChild(this.arrowPosX);
    };

    if(this.arrowheadPosY){
        this.arrowPosY = new cjs.Shape(arrow.graphics);
        this.arrowPosY.rotation = -90;
        this.gridContainer.addChild(this.arrowPosY);
    };

    if(this.arrowheadNegX){
        this.arrowNegX = new cjs.Shape(arrow.graphics);
        this.arrowNegX.rotation = 180;
        this.gridContainer.addChild(this.arrowNegX);
    };

    if(this.arrowheadNegY){
        this.arrowNegY = new cjs.Shape(arrow.graphics);
        this.arrowNegY.rotation = 90;
        this.gridContainer.addChild(this.arrowNegY);
    };
}


//--------------------------------------------------------------------------- positionArrowheads
Grid.prototype.positionArrowheads = function(){

    var origin = new cjs.Point(this.gridShape.x + (this.originoffsetX * this.unitSizeX), ((this.gridShape.y + this.gridHeight) - (this.originoffsetY * this.unitSizeY) ));

    if(this.arrowheadPosX){
        this.arrowPosX.x = this.gridShape.x + this.gridWidth;
        this.arrowPosX.y = ((this.gridShape.y + this.gridHeight) - (this.originoffsetY * this.unitSizeY)); 
    };

    if(this.arrowheadPosY){
        this.arrowPosY.x = this.gridShape.x + (this.originoffsetX * this.unitSizeX);
        this.arrowPosY.y = this.gridShape.y;
    };

    if(this.arrowheadNegX){
        this.arrowNegX.x = this.gridShape.x;
        this.arrowNegX.y = ((this.gridShape.y + this.gridHeight) - (this.originoffsetY * this.unitSizeY)); 
    };

    if(this.arrowheadNegY){
        this.arrowNegY.x = this.gridShape.x + (this.originoffsetX * this.unitSizeX);
        this.arrowNegY.y = this.gridShape.y + this.gridHeight;
    };
}




//--------------------------------------------------------------------------- helpers

function Round(Number, DecimalPlaces) {
   return Math.round(parseFloat(Number) * Math.pow(10, DecimalPlaces)) / Math.pow(10, DecimalPlaces);
}

function RoundFixed(Number, DecimalPlaces) {
   return Round(Number, DecimalPlaces).toFixed(DecimalPlaces);
}

