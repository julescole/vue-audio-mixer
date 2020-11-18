<template>

  <div class="vue-audio-mixer-timer">
    <span class="vue-audio-mixer-progress-time" :class="{'vue-audio-mixer-show-total-time':mixerVars.show_total_time}">

      <span v-if="showMins" class="vue-audio-mixer-timer-number">{{progressFormatted[0]}}</span><span v-if="showMins">:</span><span class="vue-audio-mixer-timer-number">{{progressFormatted[1]}}</span>:<span class="vue-audio-mixer-timer-number">{{progressFormatted[2]}}</span>

      <span v-if="mixerVars.show_total_time"> / </span> 
      <span class="total" v-if="mixerVars.show_total_time">
      <span v-if="showMins">{{totalLength[0]}}:</span><span>{{totalLength[1]}}</span>:<span>{{totalLength[2]}}</span>
    </span>

    </span>


   
  </div>

</template>

<script>

export default {
  name: 'timedisplay',
  props: [
      'progressTime',
      'totalTime',
      'mixerVars'
  ],
  data : function(){       
      return {
      };
  },
  computed:{

    showMins()
    {
      return this.totalTime > 61000;
    },

    totalLength(){
      return this.formatTime(this.totalTime);
    },

    progressFormatted(){
      return this.formatTime(this.progressTime);
    },
  },
  methods:{
     formatTime(millis){
        //        let hours = Math.floor(millis / 36e5);
        let  mins = Math.floor((millis % 36e5) / 6e4);
        let  secs = Math.floor((millis % 6e4) / 1000);
        let  mill = Math.floor(millis % 1000);

        if(!this.showMins){ // if 60 seconds or less, don't show minutes
          var returns = [0,this.pad(secs+(mins*60),2),this.pad(mill, 2).substring(2, 0)];
        }else{
          var returns = [this.pad(mins,2),this.pad(secs,2),this.pad(mill, 2).substring(2, 0)];
        }

        return returns;
    },
    /* PAD 
    * pad string with leading zeros
    */
    pad: function(str, max) {
        str = str.toString();
        return str.length < max ? this.pad("0" + str, max) : str;
    },
  }



}
</script>