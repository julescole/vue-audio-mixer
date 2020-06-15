<template>

	<div class="vue-audio-mixer-transport">
	    <button type="button" class="vue-audio-mixer-transport-play-button" :class="{'vue-audio-mixer-transport-play-button-active':playing}" v-on:click="$emit('togglePlay')">
	      <span></span>
	      <span></span>
	    </button>
	    <button type="button" class="vue-audio-mixer-transport-start-button" v-on:click="$emit('stop')"></button>
	</div> 

</template>

<script>

export default {
  name: 'transportbuttons',
  props: [
      'playing'
  ],
  data : function(){       
      return {
      };
  },

}
</script>