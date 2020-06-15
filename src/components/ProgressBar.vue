<template>

  <div 
    class="vue-audio-mixer-progress-bar" 
    ref="vue-audio-mixer-progress-bar" 
    v-on:mousemove="doDrag" 
    v-on:mousedown="startDrag" 
    v-on:click="progressBarClick"
  >
    <div class="vue-audio-mixer-progress-cursor" :style="{left: progressBarPosition}"></div>
  </div> 

</template>

<script>

export default {
  name: 'time',
  props: [
      'progressPercent'
  ],
  created(){
    window.addEventListener("mouseup", this.triggerMouseUpEvent);
    window.addEventListener("touchend", this.triggerMouseUpEvent);
  },
  beforeDestroy() {
    window.removeEventListener("mouseup", this.triggerMouseUpEvent);
    window.removeEventListener("touchend", this.triggerMouseUpEvent);
  },
  data : function(){       
      return {
        progressBarPosition:0,
        dragging:false,
        restart:false
      };
  },
  watch: {

    progressPercent: function(newVal){
      if(this.$refs['vue-audio-mixer-progress-bar'])
        this.progressBarPosition =  (this.$refs['vue-audio-mixer-progress-bar'].offsetWidth/100) * newVal +'px';
    },

  },
  computed:{
    totalLength(){
      return this.formatTime(this.totalTime);
    },

    progressFormatted(){
      return this.formatTime(this.progressTime);
    }

    
  },
  methods:{
    startDrag(e){
      this.dragging = true;
      this.progressBarClick(e);
    },

    doDrag(e){
      if(this.dragging)
        this.progressBarClick(e);
    },

    triggerMouseUpEvent(){
      this.dragging = false;
    },

    progressBarClick(e)
    {

      let target = this.$refs['vue-audio-mixer-progress-bar'];
      var rect = target.getBoundingClientRect();
      var x = e.clientX - rect.left; //x position within the element.
      var percent = (100/e.target.offsetWidth) * x;

      percent = Math.round(percent);

      if(percent < 0 || percent > 100)
        return false;
       // only if mouse inside box


      if(!this.dragging)
        this.$emit('percent', percent);

      this.progressBarPosition = Math.round(x) +'px';


    }
  }



}
</script>