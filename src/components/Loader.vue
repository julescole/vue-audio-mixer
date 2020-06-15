<template>

  <div class="vue-audio-mixer-loader">
    <p class="vue-audio-mixer-loader-text">Loading... <span>{{percentLoaded}}</span>%</p>
    <div class="vue-audio-mixer-loader-inner">
      <div></div>
      <div></div>
    </div>
  </div>

</template>

<script>

export default {
  name: 'loader',
  props: [
      'percentLoaded'
  ],
  data : function(){       
      return {
      };
  }

}
</script>