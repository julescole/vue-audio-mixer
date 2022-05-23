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
      'mixerVars',
      'tracks',
      'recording'
  ],
  created(){
    this.waveFormLastGenerated = new Date();
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

        waveformDataPoints:[],
        regenerate_pcm_data:false,
        waveformPadding:20,
        reduced_pcm_data:[],
        max_length:0,
        newPCMdata:[]
      };
  },
  watch: {

    tracks: {
      // This will let Vue know to look inside the array
      deep: true,

      // We have to move our method to a handler field
      handler(){
      // only allow the canvas to be refreshed once every 1 seconds max
       clearTimeout(this.regenerate_pcm_data);
        this.regenerate_pcm_data = setTimeout(() => {
            this.convertPCMDataToWaveform();
        }, 100);
      }
    },

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
            this.reducePCMData();
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

      let halfway = this.canvasHeight / 2;


      ctx.lineWidth = 1; // how thick the line is

      if(this.progress*this.dpr > x){
        if(this.recording){
          ctx.strokeStyle = isEven ?  "#8c0d0d" : "#bf1111"; // what color our line is
        }else{
          ctx.strokeStyle = isEven ?  "#38fedd" : "#99ffee"; // what color our line is
        }
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
    chunkArray(arr, size)
    {
      return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
      );
    },


    // convert PCM data to waveform data points
    convertPCMDataToWaveform()
    {

    

      this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.ctx.fillStyle="#303030";
      // create background to meters
      this.ctx.fillRect(0,0,this.canvasWidth,this.canvasHeight);

      let finalData = [];

      for (let i = 0; i < this.reduced_pcm_data.length; i++){
        for (let d = 0; d < this.reduced_pcm_data[i].data.length; d++){
          if(finalData[d] === undefined){
            finalData.push(0);
          }
          // timex value by current gain and mute
          let track_value = this.tracks[this.reduced_pcm_data[i].index].muted ? 0 : (this.reduced_pcm_data[i].data[d] * this.tracks[this.reduced_pcm_data[i].index].gain);
          finalData[d] = finalData[d] + track_value;
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
        let height = normalizedData[i] * ((this.canvasHeight-this.waveformPadding)/2);
        this.drawWaveformLineSegment(this.ctx, x, height, width, i%2 == 0);
      }

    },

    createCanvas()
    {

       // Set up the canvas
      this.canvas = document.getElementById('vue-audio-mixer-waveform');
      this.dpr = window.devicePixelRatio || 1;
      this.padding = 20;
      if(this.$refs['vue-audio-mixer-progress-bar'])
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


    /**
     * Reduced the PCM data to the ammount of pixels in the canvas
     */

    reducePCMData(data)
    {

      if(!this.canvas){
        this.createCanvas();
      }


      // the number of pcm data parts we want to analyse per pixel
      let chunk_size = Math.floor(this.max_length/this.canvasWidth);
      for (let i = 0; i < this.pcmData.length; i++){

        // split data into chunk sizes
        let newArray = this.chunkArray(this.pcmData[i].data,chunk_size);
        // make an array of the amps of each track for each pixel
        let finalData = [];
        for (let c = 0; c < newArray.length; c++){
          let amps = this.tracks[this.pcmData[i].index].muted ? 0 : (this.getAmps(newArray[c]) * this.tracks[this.pcmData[i].index].gain);
          if(finalData[c] === undefined){
            finalData.push(0);
          }
          finalData[c] =  finalData[c] + amps;
        }
        // create new data array with reduced data
        this.reduced_pcm_data.push({data:finalData, index:this.pcmData[i].index});

      }
      this.pcmData = []; // remove this massive data from the storage

      this.convertPCMDataToWaveform();

    },

    
    /*
    * Called when a new audio source is loaded. Adds the PCM data to the array
    *
    * Raw buffer data is massive, so we need to reduce this down before using it
    *
    **/
    
    addWavelengthPointData(raw){


      var channels = Math.min(2, raw.buffer.numberOfChannels);
      let finalData = [];

      for (var channel = 0; channel < channels; channel++) {

        // get the raw buffer data
        let buffer = raw.buffer.getChannelData(channel);

        // chunk this into chunks of 1000 points
        let newArray = this.chunkArray(buffer,1000);

        // make an array of the amps of each track for each chunk
        for (let c = 0; c < newArray.length; c++){
          if(finalData[c] === undefined){
            finalData.push(0);
          }
          finalData[c] =  finalData[c] + this.getAmps(newArray[c]);
        }
      }

      // Calculates the most data points there is
      if(finalData.length > this.max_length)
          this.max_length = finalData.length;

      this.pcmData.push({data:finalData,index:raw.index});

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

      // can't click while recording
      if(this.recording)
        return;

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
