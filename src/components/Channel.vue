<template>

  <div class="vue-audio-mixer-channel">

    <canvas :id="'canvas'+_uid"  width="25" height="400" style="display: block;" class="vue-audio-mixer-channel-meter-canvas"></canvas>

    <div class="vue-audio-mixer-channel-slider"> 
      <input class="vue-audio-mixer-channel-slider-input" type="range" min="0" max="1.5" step="0.01" v-on:input="changeGain" v-model="gain" />
    </div>

    <div class="vue-audio-mixer-channel-mute-button">
      <label>
        <input v-model="mute" type="checkbox" />
        <span class="vue-audio-mixer-channel-mute-button-label">M</span>
      </label>
    </div>
    
    <VueKnobControl
      :min="-90"
      :max="90"
      :size="40"
      :stroke-width="7"
      v-model="pan"
      class="vue-audio-mixer-channel-panner"
      primaryColor="#c40303"
      secondaryColor="#adadad"
      textColor="#000"
    ></VueKnobControl>

    <div class="vue-audio-mixer-channel-label" style="height: 14px;"><label data-label="0"> {{title}}</label></div>

  </div>

</template>
  


<script>

import VueKnobControl from 'vue-knob-control'
import EventBus from './../event-bus';
import variables from './../scss/includes/_variables.scss';

export default {
  name: 'Channel',
  props: [
    'index',
    'trackIndex', 
    'title',
    'context', 
    'url',
    'output',
    'leftAnalyser',
    'rightAnalyser',
    'scriptProcessorNode',
    'defaultPan',
    'defaultGain',
    'defaultMuted'
  ],
  components:{
    VueKnobControl
  },
  data : function(){       
      return {
          leftBouncer : {average:0,opacity:1},
          rightBouncer: {average:0,opacity:1},
          gradient    : false,
          ctx         : false,
          gain        : 0.8,
          pan         : 0,
          mute        : false,
          meterHeight : 400,
          meterWidth  : 10,
          titleModel : '',
          colourVals:variables
      };
  },

  watch:{

    pan: function(){
        this.changePan();
    },

    mute: function(){
        this.muteChange();
    },

    titleModel:function(){
      this.titleChange();
    }

  },

  created(){
    this.titleModel = 'Track '+(this.trackIndex+1);
    EventBus.$on('ended', this.ended);
    this.scriptProcessorNode.onaudioprocess = () => {
      this.drawMeter();
    }

   
  },

  beforeDestroy() {
    EventBus.$off('ended',this.ended);
  },

  mounted(){

      this.ctx = document.getElementById('canvas'+this._uid).getContext("2d");
      this.gradient = this.ctx.createLinearGradient(0,0,0,400);
      this.gradient.addColorStop(1,'#31e2fc');
      this.gradient.addColorStop(0.75,'#38fedd');
      this.gradient.addColorStop(0.25,'#38fedd');
      this.gradient.addColorStop(0,'#31e0fc');

      this.pan = this.defaultPan === undefined ? 0 : this.defaultPan;
      this.gain = this.defaultGain === undefined ? 0 : this.defaultGain;
      this.mute = this.defaultMuted === undefined ? false : this.defaultMuted;
    
      this.changePan();
      this.changeGain();

      this.drawMeter();

  },
  methods: {

    ended(index){

      if(index == this.index){
        setTimeout( () => { this.clearCanvas()}, 10);
      }

    },

    changeGain()
    {
      if(!this.mute){
        this.$emit('gainChange',this.gain);
      }
    },

    changePan() {
      this.$emit('panChange',this.pan);
    },

    muteChange() {
      this.$emit('muteChange',this.mute);
    },

    titleChange() {
      this.$emit('titleChange',this.titleModel);
    },



    



    getAverageVolume(array) {
        var values = 0;
        var average;
        var length = array.length;
        // get all the frequency amplitudes
        for (var i = 0; i < length; i++) {
            values += array[i];
        }
        average = values / length;
        return average;
    },


    clearCanvas(){

       // clear the current state
      this.ctx.clearRect(0, 0, 60, this.meterHeight);

      this.ctx.fillStyle="#15181b";
      // create background to meters
      this.ctx.fillRect(0,0,this.meterWidth,this.meterHeight+200);
      this.ctx.fillRect(this.meterWidth+5,0,this.meterWidth,this.meterHeight+200);

    },

   

    drawMeter(){

      // get the average for the first channel
      var array =  new Uint8Array(this.leftAnalyser.frequencyBinCount);
      this.leftAnalyser.getByteFrequencyData(array);
      var average = this.getAverageVolume(array);

      // get the average for the second channel
      var array2 =  new Uint8Array(this.rightAnalyser.frequencyBinCount);
      this.rightAnalyser.getByteFrequencyData(array2);
      var average2 = this.getAverageVolume(array2);

      // bouncers left
      if(average > this.leftBouncer.average){
        this.leftBouncer.average = average;
        this.leftBouncer.opacity = 1;
      }
      else{
        if(this.leftBouncer.opacity > 0.1) // fade out
          this.leftBouncer.opacity = this.leftBouncer.opacity -0.1;
        else
          this.leftBouncer.opacity = 0;
        this.leftBouncer.average--; // make it fall
      }

      // bouncers right
      if(average2 > this.rightBouncer.average){
        this.rightBouncer.opacity = 1;
        this.rightBouncer.average = average2;
      }
      else{
        if(this.rightBouncer.opacity > 0.1)// fade out
          this.rightBouncer.opacity = this.rightBouncer.opacity -0.1;
        else
          this.rightBouncer.opacity = 0;
        this.rightBouncer.average--;// make it fall
      }

      this.clearCanvas();

      // set the fill style
      this.ctx.fillStyle=this.gradient;


      // create the meters (ctx.meterHeight/100) is 1% of the meter height
      this.ctx.fillRect(0,this.meterHeight-(average*(this.meterHeight/100)),this.meterWidth,this.meterHeight+200);
      this.ctx.fillRect(this.meterWidth+5,this.meterHeight-(average2*(this.meterHeight/100)),this.meterWidth,this.meterHeight+200);

      // create the bouncers

      if(average > 0)
        this.ctx.fillRect(0,this.meterHeight-(this.leftBouncer.average*(this.meterHeight/100))-2,this.meterWidth,this.leftBouncer.opacity);
      if(average2 > 0)
        this.ctx.fillRect(this.meterWidth+5,this.meterHeight-(this.rightBouncer.average*(this.meterHeight/100))-2,this.meterWidth,this.rightBouncer.opacity);

    
    }

  }
}
</script>