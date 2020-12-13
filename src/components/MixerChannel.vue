<template>
 
  <Channel 
      v-if="loaded" 
      :index="_uid" 
      :trackIndex="trackIndex" 
      :title="title" 
      :defaultPan="pan" 
      :defaultMuted="muted" 
      :defaultGain="defaultGain" 
      @gainChange="changeGain" 
      @muteChange="muteChange" 
      @soloChange="soloChange" 
      @panChange="changePan" 
      :leftAnalyser="leftAnalyser" 
      :rightAnalyser="rightAnalyser" 
      :scriptProcessorNode="scriptProcessorNode" 
      :showMute="true"
      :mixerVars="mixerVars"
  />

</template>

<script>
import Channel from './Channel.vue'
import EventBus from './../event-bus';

export default {
  name: 'MixerChannel',
  props: [
      'title',
      'context', 
      'url',
      'output',
      'defaultPan',
      'defaultGain',
      'defaultMuted',
      'trackIndex',
      'mixerVars',
      'hidden',
      'solodTracks'
  ],
  components:{Channel},
  data : function(){       
      return {
        sourceNode         : false,
        scriptProcessorNode: false,
        gainNode           : false,
        pannerNode         : false,
        
        muted              : false,
        leftAnalyser       : false,
        
        leftBouncer        : {average:0,opacity:1},
        rightAnalyser      : false,
        rightBouncer       : {average:0,opacity:1},
        splitter           : false,
        ctx                : false,
        gradient           : false,
        buffer             : false,
        meterHeight        : 400,
        meterWidth         : 10,
        playFrom           : false,
        playing            : false,
        gainValue          : 0,
        pan                : 0,
        gain               : 0.8,
        loaded             : false,
        mutedBySolo                :false,
        mutedByMute                :false
      };
  },

  watch:{
    
    solodTracks(newVal)
    {
        if(this.solodTracks.length && this.solodTracks.indexOf(this.trackIndex) === -1)
          this.muteChange(true, true);
        else
          this.muteChange(false, true);
    },


  },

  created(){
    this.muted = this.defaultMuted;
    this.pan   = this.defaultPan;
    this.gainValue  = this.defaultGain.toString();

    this.scriptProcessorNode = this.context.createScriptProcessor(2048, 1, 1);
    EventBus.$on(this.mixerVars.instance_id+'play', this.playSound);
    EventBus.$on(this.mixerVars.instance_id+'stop', this.stopSound);
    this.loadSound();
  },

  beforeDestroy() {
    EventBus.$off(this.mixerVars.instance_id+'play',this.playSound);
    EventBus.$off(this.mixerVars.instance_id+'stop',this.stopSound);
  },



  mounted(){

  },
  methods: {


    mute()
    {
      this.gainValue = this.gainNode.gain.value; // store gain value
      this.gainNode.gain.value = 0; // mute the gain node
      this.muted = true;
      this.$emit('muteChange', {index:this.trackIndex,muted:this.muted});
    },

    unMute()
    {
      this.muted = false;
      this.gainNode.gain.value = this.gainValue; // restore previous gain value
      this.$emit('muteChange', {index:this.trackIndex,muted:this.muted});
    },

    

    /*
    * MUTE CHANGE
    * Event when mute changes
    */

    muteChange(value, triggered_from_solo){

        // don't mute hidden tracks
        if(this.hidden)
          return;


        if(triggered_from_solo)
        {
          if(value && !this.mutedByMute && !this.mutedBySolo)
            this.mute();
          
          if(!value && !this.mutedByMute)
            this.unMute();
        
          this.mutedBySolo = value;
        }else{
          if(value && !this.mutedByMute && !this.mutedBySolo)
            this.mute();
          
          if(!value && !this.mutedBySolo)
            this.unMute();

          this.mutedByMute = value;
        }

    },

    soloChange(value){
        this.$emit('soloChange', {index:this.trackIndex});
    },

    changeGain(gain)
    {
      this.gainValue = gain;
      //this.gain = gain;

      if(!this.muted){
        this.gainNode.gain.value = gain;
      }

        EventBus.$emit('gainChange', {index:this.trackIndex,gain:gain});

        this.$emit('gainChange', {index:this.trackIndex,gain:gain});
    },

    

    changePan(pan) {
        this.pan = pan;
        var xDeg = parseInt(pan);
        var zDeg = xDeg + 90;
        if (zDeg > 90) {
            zDeg = 180 - zDeg;
        }
        var x = Math.sin(xDeg * (Math.PI / 180));
        var z = Math.sin(zDeg * (Math.PI / 180));
        this.pannerNode.setPosition(x, 0, z);

        this.$emit('panChange', {index:this.trackIndex,pan:pan});
    },
   
    // load the specified sound
    loadSound() {
        var request = new XMLHttpRequest();
        request.open('GET', this.url, true);
        request.responseType = 'arraybuffer';

        // When loaded decode the data
        request.onload = () => { 
            // decode the data
            this.context.decodeAudioData(request.response, (buffer) => { // sound loaded
                EventBus.$emit("pcm_data_loaded", {buffer:buffer, index:this.trackIndex});
                // when the audio is decoded play the sound
                this.buffer=buffer;
                EventBus.$emit(this.mixerVars.instance_id+'track_loaded', this.buffer.duration);
                this.setupAudioNodes();

            }, this.onError);
        }
        request.send();
    },
   
    playSound(playfrom) {

        if(playfrom === undefined)
            playfrom = 0;

        this.setupAudioNodes();


        this.sourceNode.start(0,playfrom/1000);

    },

    stopSound() {
        this.sourceNode.stop(0);
    },
 
    // log if an error occurs
    onError(e) {
        console.log(e);
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


    setupAudioNodes() {
 


        // create a buffer source node
        this.sourceNode = this.context.createBufferSource();

        this.sourceNode.buffer = this.buffer;

       


       // this.sourceNode.loop = false; // false to stop looping
      //  this.sourceNode.muted = false; 


       // this.sourceNode.playbackRate.value = 1;

        // setup a analyzers
        this.leftAnalyser = this.context.createAnalyser();
        this.leftAnalyser.smoothingTimeConstant = 0.6;
        this.leftAnalyser.fftSize = 1024;
 
        this.rightAnalyser = this.context.createAnalyser();
        this.rightAnalyser.smoothingTimeConstant = 0.6;
        this.rightAnalyser.fftSize = 1024;



        // Create a gain node.
        this.gainNode = this.context.createGain();

        // Create a panner node.
        this.pannerNode = this.context.createPanner();
        this.pannerNode.panningModel = "equalpower";
        
        // setup a javascript node

        // create splitter
        this.splitter = this.context.createChannelSplitter(2);



        // connect everything together
        this.pannerNode.connect(this.splitter);
        this.gainNode.connect(this.pannerNode);
        this.scriptProcessorNode.connect(this.gainNode);
        this.sourceNode.connect(this.gainNode);
        this.splitter.connect(this.leftAnalyser,0,0);
        this.splitter.connect(this.rightAnalyser,1,0);
        this.pannerNode.connect(this.output);


        //this.leftAnalyser.connect(this.scriptProcessorNode);


        // initial values
        // 

        let mutedBySolo = this.mutedBySolo;
        this.mutedBySolo = false;
        this.mutedByMute = false;
       
        this.gainNode.gain.value = this.gainValue;
        this.changeGain(this.gainValue);

        this.muteChange(this.muted, mutedBySolo);

        this.changePan(this.pan);



        this.sourceNode.onended = () => {
          this.onended();
        }

        this.loaded = true;
      
    },


    onended()
    {

        // disconnect everything
        this.scriptProcessorNode.disconnect();
        this.sourceNode.disconnect();
        this.gainNode.disconnect();
        this.pannerNode.disconnect();
        this.leftAnalyser.disconnect();
        this.rightAnalyser.disconnect();
        this.splitter.disconnect();

        if(this.playFrom)
            EventBus.$emit(this.mixerVars.instance_id+'play', this.playFrom);

        EventBus.$emit(this.mixerVars.instance_id+'ended',this._uid);

    },

    

  }
}
</script>