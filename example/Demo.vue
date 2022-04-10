<template>

  <div>
    <div style="text-align: center;">

      <div style="position:relative; display: inline-block; ">
        <vue-audio-mixer 
          :config="config" 
          size="medium" 
          theme="dark" 
          @loaded="loadedChange"
          @input="setConfig" 
          :showPan="true"
          :showTotalTime="true"
        />
      </div>

    </div>

    <pre v-html="syntaxHighlight(newConfig)"></pre>

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
      is_loaded:false,
      newConfig: null,
      config: {
        "tracks":[
            {
                "title":"Bass",
                "url":"https://audio.jukehost.co.uk/pr3Z0ZGjFa2AtYwzE3h2PpYGLGd60XaO",
                "pan":-30,
                "gain":1,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Flutes",
                "url":"https://audio.jukehost.co.uk/8GH7R04EJ4RmHqeKqvVNphw6tv59aFBG",
                "pan":81,
                "gain":1.08,
                "muted":false,
                "hidden":false
            },
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

    this.newConfig = this.config;

  },

  beforeDestroy() {
  
  },
  methods:{

    loadedChange(loaded)
    {
      this.is_loaded = loaded;
    },

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



