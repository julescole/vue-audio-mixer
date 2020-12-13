<template>

  <div>




      <div 
        class="vue-audio-mixer-progress-bar" 
        ref="vue-audio-mixer-progress-bar" 
        v-on:mousedown="startDrag" 
      >
      <canvas width="0" height="20" id="vue-audio-mixer-waveform"></canvas>

        <div class="vue-audio-mixer-progress-cursor" :style="{left: progressBarPosition}"></div>
      </div> 
  </div> 

</template>

<script>
import EventBus from './../event-bus';

export default {
  name: 'progressbar',
  props: [
      'progressPercent',
      'mixerVars'
  ],
  created(){
    window.addEventListener('mousemove',this.doDrag);
    window.addEventListener("mouseup", this.triggerMouseUpEvent);
    window.addEventListener("touchend", this.triggerMouseUpEvent);
    EventBus.$on('pcm_data_loaded',this.addWavelengthPointData);
    EventBus.$on('loaded',this.create);
  },
  beforeDestroy() {
    window.removeEventListener('mousemove',this.doDrag);
    window.removeEventListener("mouseup", this.triggerMouseUpEvent);
    window.removeEventListener("touchend", this.triggerMouseUpEvent);
  },
  data : function(){       
      return {
        progress:0,
        dragging:false,
        restart:false,
        pcmData:[],
        rightData:[],

        canvas:null,
        dpr:null,
        padding:null,
        ctx:null,
        canvasWidth:0,
        canvasHeight:0,

        waveformDataPoints:[]
      };
  },
  watch: {

    progressPercent: function(newVal){
      if(this.$refs['vue-audio-mixer-progress-bar'] && !this.dragging)
        this.progress =  (this.$refs['vue-audio-mixer-progress-bar'].offsetWidth/100) * newVal;
    },

    progress:function()
    {
      this.drawWaveform(); 
    }

  },
  computed:{
    totalLength(){
      return this.formatTime(this.totalTime);
    },

    progressFormatted(){
      return this.formatTime(this.progressTime);
    },

    progressBarPosition()
    {
      return this.progress+'px';
    }

    
  },
  methods:{

    create(loaded){
      if(loaded){
        if(!this.canvas){
          this.$nextTick(() => {
            this.resizeCanvas();
          });
        }
      }

    },

    // normalize the waveform data so it appears as big as possible
    normalizeData(filteredData) {
      const multiplier = Math.pow(Math.max(...filteredData), -1);
      return filteredData.map(n => n * multiplier);
    },

    // Fraws the waveform
    drawWaveformLineSegment (ctx, x, y, width, isEven) {

      let halfway = this.canvas.offsetHeight;

      ctx.lineWidth = 1; // how thick the line is

      if(this.progress*this.dpr > x){
        ctx.strokeStyle = isEven ?  "#38fedd" : "#99ffee"; // what color our line is
      }else{
        ctx.strokeStyle = isEven ?  "#a3a3a3" : "#d9d9d9"; // what color our line is
      }

      ctx.beginPath();
      y = isEven ? y : -y;

      y = halfway +y;

      ctx.moveTo(x, halfway);
      ctx.lineTo(x, y);
      ctx.stroke();
    },

    // returns the loudness of an array of PCM data
    getAmps(buffer)
    {

      var rms = 0;

      for (var i = 0; i < buffer.length; i++) {
        rms += buffer[i] * buffer[i];
      }

      rms /= buffer.length;
      rms = Math.sqrt(rms);
      return rms;

    },

    // splits array into chunks
    chunkArray(array, chunk_size)
    {

      let chunks = [];
      var i,j,temparray,chunk = chunk_size;
      for (i=0,j=array.length; i<j; i+=chunk) {
          chunks.push(array.slice(i,i+chunk));
      }
      return chunks;
  },

    // convert PCM data to waveform data points
    resizeCanvas()
    {

      this.createCanvas();
      this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.ctx.fillStyle="#303030";
      // create background to meters
      this.ctx.fillRect(0,0,this.canvasWidth,this.canvasHeight);

      let finalData = [];

      let length = 0;
      for (let i = 0; i < this.pcmData.length; i++){
        if(this.pcmData[i].length > length){
          length = this.pcmData[i].length;
        }
      }

      let chunk_size = Math.floor(length/this.canvasWidth);

      for (let i = 0; i < this.pcmData.length; i++){

        let newArray = this.chunkArray(this.pcmData[i],chunk_size);
   
        for (let c = 0; c < newArray.length; c++){
          let amps = this.getAmps(newArray[c]);
          if(finalData[c] === undefined){
            finalData.push(0);
          }
          finalData[c] =  finalData[c] + amps;
        }
      }

      let normalizedData = this.filterData(finalData);
      normalizedData = this.normalizeData(normalizedData);

      this.waveformDataPoints = normalizedData;
      this.drawWaveform();

    },

    // draws the waveform
    drawWaveform(){

      let normalizedData = this.waveformDataPoints;

      // draw the line segments
      const width = this.canvasWidth;
    
      for (let i = 0; i < normalizedData.length; i++) {
        const x = i;
        let height = normalizedData[i] * (this.canvas.offsetHeight/2);
        this.drawWaveformLineSegment(this.ctx, x, height, width, i%2 == 0);
      }

    },

    createCanvas()
    {

       // Set up the canvas
      this.canvas = document.getElementById('vue-audio-mixer-waveform');
      this.dpr = window.devicePixelRatio || 1;
      this.padding = 20;
      this.canvasWidth = this.$refs['vue-audio-mixer-progress-bar'].offsetWidth * this.dpr;
      this.canvas.width = this.canvasWidth;
      this.canvas.height = 100;
      this.canvasHeight = this.canvas.offsetHeight * this.dpr;
      this.ctx = this.canvas.getContext("2d");
    },

    // filters data so we only have the correct number of data points to the number of pixesl in the canvas
    filterData(rawData)
    {
      const samples = this.canvasWidth; // Number of samples we want to have in our final data set
      const blockSize = rawData.length / samples; // Number of samples in each subdivision
      const filteredData = [];
      for (let i = 0; i < samples; i++) {
        let index = rawData[Math.ceil(i * blockSize)];
        if(index !== undefined)
          filteredData.push(rawData[Math.ceil(i * blockSize)]); 
      }
      return filteredData;
    },

    // Called when a new audio source is loaded. Adds the PCM data to the array
    addWavelengthPointData(data){
      this.pcmData.push(data.data);
    },

    startDrag(e){
      this.dragging = true;
      this.progressBarClick(e);
    },

    doDrag(e){
      if(this.dragging)
        this.progressBarClick(e);
    },

    triggerMouseUpEvent(e){
      let doIt = this.dragging ? true : false;
      this.dragging = false;
      if(doIt)
        this.progressBarClick(e, true);
    },

    progressBarClick(e, fdsa)
    {

      let target = this.$refs['vue-audio-mixer-progress-bar'];
      var rect = target.getBoundingClientRect();
      var x = e.clientX - rect.left; //x position within the element.
      var percent = (100/target.offsetWidth) * x;

      percent = Math.round(percent);

      if(percent < 0 || percent > 100)
        return false;
       // only if mouse inside box


      if(!this.dragging)
        this.$emit('percent', percent);
      else
        this.progress = Math.round(x);

    }
  }



}
</script>

<style>

  </style>}
