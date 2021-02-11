<template>

  <div class="vue-audio-mixer" :class="[themeClassSize, themeClassColour, trackClass]" :style="{ width: mixerWidth }">

    <p class="vue-audio-mixer-error" v-if="track_load_error">Track {{track_load_error}} failed to load. Check that the track is hosted on the same domain as the mixer, or that CORS is enabled on the track's hosting service.</p>

    <Loader v-else-if="loading" :percentLoaded="loadingPercent" />

    <div class="vue-audio-mixer-loading-hider" v-show="!loading">

      <div class="vue-audio-mixer-channel-strip" ref="channelstrip" >
          <div>

            <MixerChannel 
              v-show="!track.hidden"
              v-for="(track,index) in tracks" 
              :title="track.title" 
              :defaultPan="track.pan" 
              :hidden="track.hidden" 
              :defaultGain="track.gain" 
              :defaultMuted="track.muted" 
              :context="context" 
              :output="gainNode" 
              :url="track.url" 
              :key="index" 
              :solodTracks="solodTracks"
              :trackIndex="index" 
              @panChange="changePan" 
              @gainChange="changeGain" 
              @muteChange="changeMute" 
              @soloChange="changeSolo"
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
              :showMute="false"
              :isMaster="true"
              :mixerVars="mixerVars"
            />
          </div>

          <ProgressBar 
            :recording="recording"
            :progressPercent="progressPercent" 
            @percent="playFromPercent" 
            :mixerVars="mixerVars"
            :tracks="tracks"
          />
          <div class="time_and_transport">
            <TimeDisplay 
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
          </div>


      </div>

      <div class="text-center">
        <button @click="saveAudioMix" class="vue-audio-mixer-download-mix" :class="{'recording':recording}">Record and download mix</button>
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
import Recorder from './../recorder';



export default {
  name: 'app',

  props: {
    theme:{
      String, 
      default:'default'
    },
    config: Object,
    size: {
      type: String,
      default:'medium'
    },
    showPan: {
      type: Boolean,
      default:true
    },
    showTotalTime:{
      type: Boolean,
      default:true
    }
  },
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
        solodTracks                : [],
        tracksLoaded               : 0,
        recorder                   : null,
        recording                  :false,
        track_load_error           : false
      };
  },
  created(){


    this.currentTime =  Date.now()
    this.startedAt = this.currentTime;

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
    EventBus.$on(this.mixerVars.instance_id+'soloChange', this.detectedSoloChange);

    EventBus.$on('track_load_error',this.trackLoadError);

    setInterval(() => {
      if(this.playing)
        this.currentTime =  Date.now()
    }, 1);

  },

  beforeDestroy() {
    EventBus.$off(this.mixerVars.instance_id+'soloChange',this.detectedSoloChange);
    EventBus.$off(this.mixerVars.instance_id+'track_loaded',this.trackLoaded);
    EventBus.$off(this.mixerVars.instance_id+'stop',this.stopped);
    EventBus.$off(this.mixerVars.instance_id+'play',this.started);
  },

  watch: {
    progressPercent: function(newVal){
      if(newVal >= 100)
         EventBus.$emit(this.mixerVars.instance_id+'stop');
    },

    loading(newVal) {
      EventBus.$emit('loaded',!newVal);
      this.$emit('loaded',!newVal)
    },

    trackSettings(newVal)
    {
      this.$emit('input',newVal)
    }

    
  },

  computed: {

    visibleTracks(){

      return this.tracks.filter(t => !t.hidden);

    },

    mixerWidth()
    {

      if(this.track_load_error){
        return '500px';
      }


      let width = 69; // channel width of medium
      if(this.mixerVars.theme_size == 'Small'){
        width = 51; // channel width of small
      }
      return (width*(this.visibleTracks.length+1))+'px';

    },

    mixerVars()
    {
      return {
        'theme_size'     : this.themeSize,
        'theme_colour'     : this.theme,
        'instance_id'    : this._uid,
        'show_pan'       : this.showPan,
        'show_total_time': this.showTotalTime
      }
    },

    trackClass()
    {

      return 'vue-audio-mixer-theme-tracks-'+this.tracks.length;

    },

    themeClassColour(){
      return 'vue-audio-mixer-theme-'+this.theme;
    },

    themeClassSize() {
      let className = 'vue-audio-mixer-theme-'+(this.themeSize.toLowerCase());
      let toReturn = {};
      toReturn[className] = true;
      return toReturn;
    },

    themeSize()
    {
      if(this.size && this.size.toLowerCase() == 'small'){
        return 'Small'
      }

      return 'Medium'
    },

    // the starter config for the current settings
    trackSettings()
    {

      return {
        tracks: this.tracks,
        master:{
          "pan":parseFloat(this.masterPanValue),
          "gain":parseFloat(this.masterGainValue),
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

    trackLoadError(track_url)
    {

      this.track_load_error = track_url;

    },

    saveAudioMix(){
        this.stop();
        this.recording = true;
        this.recorder = new Recorder(this.pannerNode);
        this.play();
        this.recorder.record();
        this.stopMix();
    },

    stopMix() {
      setTimeout(() => {
        this.stopRecording();
     }, this.totalDuration)
    },

    stopRecording(){

      if(this.recording){
        this.recording = false;
        this.stop();
        this.recorder.exportWAV((blob) => {
            var a = document.createElement("a");
            document.body.appendChild(a);
            a.style = "display: none";
            let url = window.URL.createObjectURL(blob);
            a.href = url;
            a.download = 'mix.wav';
            a.click();
            window.URL.revokeObjectURL(url);
        });
      }
    },

    detectedSoloChange(track)
    {
        let index = this.solodTracks.indexOf(track.index);
        if (index > -1) {
          if(!track.solo)
            this.solodTracks.splice(index, 1);
        }else{
          if(track.solo)
            this.solodTracks.push(track.index);
        }
    },

    playFromPercent(percent){

      if(this.playing){
        this.restart = true;
        EventBus.$emit(this.mixerVars.instance_id+'stop');
      }

      this.currentTime =  Date.now();
      this.pausedAt =  (this.totalDuration/100) * percent;
      this.startedAt = this.currentTime - this.pausedAt;

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

    pause()
    {

      // stop if already playing
      if(this.playing){
        this.stopRecording();
        this.pausedAt = this.progress;
        EventBus.$emit(this.mixerVars.instance_id+'stop');
      }

    },

    play()
    {
      if(this.playing)
        this.pause();

      this.doPlay();

      
      
    },
    doPlay(){

      if(this.progressPercent >= 100){ // it's at the end, so restart
        this.playing = true;
        this.playFromPercent(0);
      }else{
        this.startedAt = Date.now() - this.progress;
        EventBus.$emit(this.mixerVars.instance_id+'play',this.pausedAt);      
      }

    },





    togglePlay()
    {

      if(this.playing){
        this.pause();
      }else {
        this.doPlay();
      }
      
    },

    stop()
    {
      if(!this.playing){
        this.stopRecording();
      }

      if(this.playing){
        this.pause();
      }
      
      this.pausedAt = 0

      if(!this.playing){
        this.startedAt = this.currentTime;
        EventBus.$emit(this.mixerVars.instance_id+'stop');
      }
    },

    trackLoaded(duration){

      this.tracksLoaded++;


    

      duration = duration*1000;

      if(duration > this.totalDuration){
        this.totalDuration = duration;
      }

    },


    changeGain(value){
      this.tracks[value.index].gain = parseFloat(value.gain);
    },

    changePan(value){
      this.tracks[value.index].pan = parseFloat(value.pan);
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