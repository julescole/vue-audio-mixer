<template>

  <div class="vue-audio-mixer" :class="themeClass" >

    <Loader v-if="loading" :percentLoaded="loadingPercent" />

    <div v-show="!loading">

      <div class="vue-audio-mixer-channel-strip" ref="channelstrip" >
          <div>
            <MixerChannel 
              v-for="(track,index) in tracks" 
              :title="track.title" 
              :defaultPan="track.pan" 
              :defaultGain="track.gain" 
              :defaultMuted="track.muted" 
              :context="context" 
              :output="gainNode" 
              :url="track.url" 
              :key="index" 
              :trackIndex="index" 
              @panChange="changePan" 
              @gainChange="changeGain" 
              @muteChange="changeMute" 
              @soloChange="changeSolo"
              :showPan="showPan"
              :mixerVars="mixerVars"
            />

            <!-- master channel -->
            <Channel  
              title="Master" 
              :defaultPan="masterPanValue" 
              :defaultGain="masterGainValue" 
              :defaultMuted="masterMuted" 
              @muteChange="changeMasterMute" 
              @gainChange="changeMasterGain"  
              @panChange="changeMasterPan" 
              :leftAnalyser="leftAnalyser" 
              :rightAnalyser="rightAnalyser" 
              :scriptProcessorNode="scriptProcessorNode"
              :showPan="showPan"
              :showMute="false"
              :isMaster="true"
              :mixerVars="mixerVars"
            />
          </div>

          <ProgressBar 
            :progressPercent="progressPercent" 
            @percent="playFromPercent" 
            :mixerVars="mixerVars"
          />
          <div class="time_and_transport">
            <TimeDisplay 
            :showTotalTime="false" 
            :progressTime="progress" 
            :totalTime="totalDuration" 
            :mixerVars="mixerVars"
            />
            <TransportButtons 
            :playing="playing" 
            @stop="stop" 
            @togglePlay="togglePlay" 
            :mixerVars="mixerVars"
            />
            <button class="custom_button">In den Warenkorb</button>
          </div>


      </div>
     
     
    </div>
   
  </div>

    
</template>

<script>

import MixerChannel from './MixerChannel.vue';
import Channel from './Channel.vue';
import TimeDisplay from './TimeDisplay.vue';
import ProgressBar from './ProgressBar.vue';
import TransportButtons from './TransportButtons.vue';
import Loader from './Loader.vue';
import EventBus from './../event-bus';
import variables from '../scss/includes/_variables.scss';



export default {
  name: 'app',
  props: [
      'config'
  ],
  components: {
    MixerChannel,
    Channel,
    Loader,
    TimeDisplay,
    TransportButtons,
    ProgressBar
  },
  data : function(){       
      return {
        showPan                    : false,
        context                    : false,
        gainNode                   : false,
        scriptProcessorNode        : false,
        leftAnalyser               : false,
        rightAnalyser              : false,
        splitter                   : false,
        masterPanValue             : 0,
        masterGainValue            : 1,
        masterMuted                : false,
        totalDuration              : 0,
        startedAt                  : 0,
        currentTime                : 0,
        timelineWidth              : 0,
        playing                    : false,
        pausedAt                   : 0,
        dragging                   : false,
        restart                    : false,
        overRideProgressBarPosition: false,
        progressBarPosition        : 0,
        tracks                     : [],
        tracksLoaded               : 0
      };
  },
  created(){

    this.checkConfig();


    var AudioContext = window.AudioContext // Default
    || window.webkitAudioContext // Safari and old versions of Chrome
    || false; 

    this.context            = new AudioContext;
    this.gainNode           = this.context.createGain();
    this.gainNode.connect(this.context.destination);
    this.scriptProcessorNode = this.context.createScriptProcessor(2048, 1, 1);
    this.setupAudioNodes();
    EventBus.$on(this.mixerVars.instance_id+'track_loaded', this.trackLoaded);
    EventBus.$on(this.mixerVars.instance_id+'stop', this.stopped);
    EventBus.$on(this.mixerVars.instance_id+'play', this.started);

    setInterval(() => {
      if(this.playing)
        this.currentTime =  Date.now()
    }, 1);

  },

  beforeDestroy() {
    EventBus.$off(this.mixerVars.instance_id+'track_loaded',this.trackLoaded);
    EventBus.$off(this.mixerVars.instance_id+'stop',this.stopped);
    EventBus.$off(this.mixerVars.instance_id+'play',this.started);
  },

  watch: {
    progressPercent: function(newVal){
      if(newVal >= 100)
         EventBus.$emit(this.mixerVars.instance_id+'stop');
    },

    trackSettings(newVal)
    {
      this.$emit('input',newVal)
    }
  },

  computed: {

    mixerVars()
    {
      return {
        'theme_size' : this.themeSize,
        'instance_id': this._uid
      }
    },

    themeClass() {
      let className = 'vue-audio-mixer-theme-'+(this.themeSize.toLowerCase());
      let toReturn = {};
      toReturn[className] = true;
      return toReturn;
    },

    themeSize()
    {
      switch(true)
      {
        case this.tracks.length > 4:
          return 'Small'
          break;
        default:
          return 'Medium'
      }

    },

    // the starter config for the current settings
    trackSettings()
    {

      return {
        tracks: this.tracks,
        master:{
          "pan":this.masterPanValue,
          "gain":this.masterGainValue,
          "muted":this.masterMuted
        }
      };

    },

    progress(){
      return this.currentTime - this.startedAt;
    },

    progressPercent(){
      return (100/this.totalDuration)*(this.progress);
    },

    loading(){
      return this.tracksLoaded == 0 || this.tracksLoaded < this.tracks.length;
    },

    loadingPercent(){
      return ((100/this.tracks.length)*this.tracksLoaded).toFixed(2);
    }

  
  },

  methods: {

    playFromPercent(percent){

      if(this.playing){
        this.restart = true;
        EventBus.$emit(this.mixerVars.instance_id+'stop');
      }
      this.pausedAt =  (this.totalDuration/100) * percent;
      this.startedAt = Date.now() - this.pausedAt;

      if(this.restart)
        setTimeout( () => { EventBus.$emit(this.mixerVars.instance_id+'play',this.pausedAt) }, 10);

      this.restart = false;
    },


    checkConfig(){

      let json = this.config;

      if(json){
        this.tracks          = json.tracks;
        this.masterPanValue  = json.master.pan;
        this.masterGainValue = json.master.gain;
        this.masterMuted     = json.master.muted;
      }


    },


    started(){
      this.overRideProgressBarPosition = false;
      this.playing = true;
    },

    stopped(){
      this.playing = false;
    },





    togglePlay()
    {
      if(this.playing){
        this.pausedAt = this.progress;
        EventBus.$emit(this.mixerVars.instance_id+'stop');
      }else{
        this.startedAt = Date.now() - this.progress;
        EventBus.$emit(this.mixerVars.instance_id+'play',this.pausedAt);
      }
      
    },

    stop()
    {
      this.pausedAt = 0
      this.startedAt = this.currentTime;
      EventBus.$emit(this.mixerVars.instance_id+'stop');
    },

    trackLoaded(duration){

      this.tracksLoaded++;


    

      duration = duration*1000;

      if(duration > this.totalDuration){
        this.totalDuration = duration;
      }

    },


    changeGain(value){
      this.tracks[value.index].gain = value.gain;
    },

    changePan(value){
      this.tracks[value.index].pan = value.pan;
    },

    changeMute(value){
      this.tracks[value.index].muted = value.muted;
    },

    changeSolo(value){

    },

 

    /************************************************************
    *
    * Master channel controls
    *
    *************************************************************/

    changeMasterMute(value){
      if(value){
        this.masterGainValue = this.gainNode.gain.value; // store gain value
        this.gainNode.gain.value = 0; // mute the gain node
        this.masterMuted = true;
      }
      else{
        this.masterMuted = false;
        this.gainNode.gain.value = this.masterGainValue; // restore previous gain value
      }

    },

     // Master Gain

    changeMasterGain(gain)
    {
      this.masterGainValue = gain;
      if(!this.masterMuted)
        this.gainNode.gain.value = gain;
    },

    // Master Pan

    changeMasterPan(pan) {
      var xDeg = parseInt(pan);
      var zDeg = xDeg + 90;
      if (zDeg > 90) {
        zDeg = 180 - zDeg;
      }
      var x = Math.sin(xDeg * (Math.PI / 180));
      var z = Math.sin(zDeg * (Math.PI / 180));
      this.pannerNode.setPosition(x, 0, z);

      this.masterPanValue = pan;
    },

    // Master Audio Nodes

    setupAudioNodes() {


        // setup a analyzers
        this.leftAnalyser = this.context.createAnalyser();
        this.leftAnalyser.smoothingTimeConstant = 0.3;
        this.leftAnalyser.fftSize = 1024;
 
        this.rightAnalyser = this.context.createAnalyser();
        this.rightAnalyser.smoothingTimeConstant = 0.0;
        this.rightAnalyser.fftSize = 1024;

        // Create a gain node.
        this.gainNode = this.context.createGain();

        // Create a panner node.
        this.pannerNode = this.context.createPanner();
        this.pannerNode.panningModel = "equalpower";
        
        // create splitter
        this.splitter = this.context.createChannelSplitter();

        // connect everything together
        this.scriptProcessorNode.connect(this.gainNode);
        this.gainNode.connect(this.pannerNode);
        this.pannerNode.connect(this.splitter);
        this.splitter.connect(this.leftAnalyser,0,0);
        this.splitter.connect(this.rightAnalyser,1,0);
       // this.leftAnalyser.connect(this.scriptProcessorNode);
        this.pannerNode.connect(this.context.destination);

        // initial values
        this.changeMasterGain(this.masterGainValue);
        this.changeMasterPan(this.masterPanValue);
       // this.changeMasterMute(this.masterMuted);

    },

   

  }

}
</script>