<template>
  <div>
    <vue-audio-mixer :config="config" @input="setConfig" />
    <!--<pre v-html="syntaxHighlight(newConfig)"></pre>-->
    <vue-audio-mixer :config="config2"  />

  </div>

</template>

<script>

import VueAudioMixer from '../src/components/Mixer.vue';
import '../src/scss/main.scss'; 

export default {
  name: 'app',
  components: {
    VueAudioMixer
  },
  data : function(){     

    return {
      newConfig: null,
      config:{
        "tracks":[
          {
            "title":"bass",
            "url":"https://api.soundcloud.com/tracks/116244941/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
            "pan":0,
            "gain":0.5,
            "muted":false
          },
          {
            "title":"bass",
            "url":"https://api.soundcloud.com/tracks/116244941/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
            "pan":0,
            "gain":0.5,
            "muted":false
          },
          {
            "title":"bass",
            "url":"https://api.soundcloud.com/tracks/116244941/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
            "pan":0,
            "gain":0.5,
            "muted":false
          }
        ],
        "master":{
          "pan":0,
          "gain":1,
          "muted":false
        }
      },
      config2: {
        "tracks":[
            {
                "title":"Bass",
                "url":"https://api.soundcloud.com/tracks/841840237/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-30,
                "gain":0.5,
                "muted":false
            },
            {
                "title":"Flutes",
                "url":"https://api.soundcloud.com/tracks/841840234/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":81,
                "gain":"1.08",
                "muted":false
            },
            {
                "title":"Percussion",
                "url":"https://api.soundcloud.com/tracks/841840222/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-49,
                "gain":"0.85",
                "muted":false
            },
            {
                "title":"Piano",
                "url":"https://api.soundcloud.com/tracks/841840216/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-60,
                "gain":0.6,
                "muted":false
            },
            {
                "title":"Strings",
                "url":"https://api.soundcloud.com/tracks/841840174/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-49,
                "gain":"0.85",
                "muted":false
            }
        ],
        "master":{
            "pan":0,
            "gain":1,
            "muted":false
        }
      }
    }    
  },
  created(){

  },

  beforeDestroy() {
  
  },
  methods:{

    setConfig(newVal)
    {
      this.newConfig = newVal;
    },

    // accepts json string
    // returns pretyyprinted json
    syntaxHighlight(json) {
      if (typeof json != 'string') {
           json = JSON.stringify(json, undefined, 2);
      }
      json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
          var cls = 'number';
          if (/^"/.test(match)) {
              if (/:$/.test(match)) {
                  cls = 'key';
              } else {
                  cls = 'string';
              }
          } else if (/true|false/.test(match)) {
              cls = 'boolean';
          } else if (/null/.test(match)) {
              cls = 'null';
          }
          return '<span class="' + cls + '">' + match + '</span>';
      });
  }



  },

  computed: {

  }

}
</script>

<style>

pre {outline: 1px solid #ccc; padding: 5px; margin: 5px; }
.string { color: green; }
.number { color: darkorange; }
.boolean { color: blue; }
.null { color: magenta; }
.key { color: red; }

</style>



