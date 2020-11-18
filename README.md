# Audio Mixer

- [Demo](#demo)
- [Install](#install)
- [Support us](#support-us)

## Demo

To view a demo online:
https://audiomixer.io

To view demo examples locally clone the repo and run `npm install && npm run serve`

## Install

``` bash
npm install vue-audio-mixer --save
```


``` html
<template>

  <div>
    <div style="text-align: center;">

      <div style="position:relative; display: inline-block; ">
        <vue-audio-mixer 
          :config="config" 
          size="medium" 
          @loaded="loadedChange"
          @input="setConfig" 
          :showPan="true"
          :showTotalTime="true"
        />
      </div>

    </div>

    <pre v-html="newConfig"></pre>

  </div>

</template>

<script>

import VueAudioMixer from 'vue-audio-mixer';
import 'vue-audio-mixer/dist/vue-audio-mixer.min.css'; 

export default {
  name: 'App',
  components: {
    VueAudioMixer
  },
  data : function(){     
    return {
      is_loaded:false,
      newconfig:{},
      config: {
        "tracks":[
            {
                "title":"Bass",
                "url":"https://api.soundcloud.com/tracks/841840237/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-30,
                "gain":0.5,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Flutes",
                "url":"https://api.soundcloud.com/tracks/841840234/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":81,
                "gain":1.08,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Perc",
                "url":"https://api.soundcloud.com/tracks/841840222/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-49,
                "gain":0.85,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Piano",
                "url":"https://api.soundcloud.com/tracks/841840216/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-60,
                "gain":0.6,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Strings",
                "url":"https://api.soundcloud.com/tracks/841840174/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-49,
                "gain":0.85,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Bass",
                "url":"https://api.soundcloud.com/tracks/841840237/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-30,
                "gain":0.5,
                "muted":false,
                "hidden":false
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
    }

  }
}
</script>
```

Or use directly from a CDN
``` html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/vue-audio-mixer/dist/vue-audio-mixer.min.css">
</head>
<body>

<div id="app">
  <div>
    <div style="text-align: center;">

      <div style="position:relative; display: inline-block; ">
        <vue-audio-mixer 
            :config="config" 
            size="medium" 
            @loaded="loadedChange"
            @input="setConfig" 
            :show-pan="true"
            :show-total-time="true"
        />
      </div>

    </div>

    <pre v-html="newConfig"></pre>

  </div>
</div>
<script src="https://unpkg.com/vue"></script>
<script src="https://unpkg.com/vue-audio-mixer/dist/vue-audio-mixer.min.js"></script>

<script>
const app = new Vue({
  el: '#app',
  data : function(){     
    return {
      is_loaded:false,
      newconfig:{},
      config: {
        "tracks":[
            {
                "title":"Bass",
                "url":"https://api.soundcloud.com/tracks/841840237/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-30,
                "gain":0.5,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Flutes",
                "url":"https://api.soundcloud.com/tracks/841840234/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":81,
                "gain":1.08,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Perc",
                "url":"https://api.soundcloud.com/tracks/841840222/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-49,
                "gain":0.85,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Piano",
                "url":"https://api.soundcloud.com/tracks/841840216/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-60,
                "gain":0.6,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Strings",
                "url":"https://api.soundcloud.com/tracks/841840174/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-49,
                "gain":0.85,
                "muted":false,
                "hidden":false
            },
            {
                "title":"Bass",
                "url":"https://api.soundcloud.com/tracks/841840237/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-30,
                "gain":0.5,
                "muted":false,
                "hidden":false
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
    }

  }
})
</script> 

</body>
</html>


```

## Support us

Vue Audio Mixer is developed and maintained by Realstrings in support of Samaritans. If Vue-Audio-Mixer makes it to your production environment, we would appreciate you making a donation at the following link. https://www.justgiving.com/fundraising/onlineaudiomixer