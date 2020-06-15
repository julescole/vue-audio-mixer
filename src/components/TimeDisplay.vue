<template>

  <div class="vue-audio-mixer-timer">
    <span class="progress-time">
      <span>{{progressFormatted[0]}}</span>:<span>{{progressFormatted[1]}}</span>:<span>{{progressFormatted[2]}}</span>
    </span>
    <span> / </span> 
    <span class="total">
      <span>{{totalLength[0]}}</span>:<span>{{totalLength[1]}}</span>:<span>{{totalLength[2]}}</span>
    </span>
  </div>

</template>

<script>

export default {
  name: 'timedisplay',
  props: [
      'progressTime',
      'totalTime'
  ],
  data : function(){       
      return {
      };
  },
  computed:{
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
        var returns = [this.pad(mins,2),this.pad(secs,2),this.pad(mill, 2).substring(2, 0)];
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