# Audio Mixer

- [Demo](#demo)
- [Install](#install)
- [Support us](#support)

## Demo

To view a demo online:
https://audiomixer.io

To view demo examples locally clone the repo and run `npm install && npm run serve`

## Install

``` bash
npm install vue-audio-mixer --save
```


``` javascript
import VueAudioMixer from 'vue-audio-mixer';

export default {
  // ...
  components: {
    VueAudioMixer
  }
  // ...
}
```

Or use directly from a CDN
``` html
<div id="app">
  <vue-audio-mixer :config="config" ></vue-audio-mixer>
</div>
<script src="https://unpkg.com/vue"></script>
<script src="https://unpkg.com/vue-audio-mixer"></script>
<script>
const app = new Vue({
  el: '#app',
  data : function(){     
	return {
      config: {
        "tracks":[
            {
                "title":"Strings1",
                "url":"https://api.soundcloud.com/tracks/515722791/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-60,
                "gain":0.5,
                "muted":false
            },
            {
                "title":"Strings2",
                "url":"https://api.soundcloud.com/tracks/515722791/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":81,
                "gain":"1.08",
                "muted":true
            },
            {
                "title":"Strings3",
                "url":"https://api.soundcloud.com/tracks/515722791/stream?client_id=ae1dadcc70f054f451de8c6358bcf396",
                "pan":-49,
                "gain":"0.85",
                "muted":true
            }
        ],
        "masterGainValue":0.2,
        "masterMuted":false,
        "masterPanValue":43
      }
    }  
    
  },
  components: {
  	VueAudioMixer
  }
})
</script>


```

## Support us

Vue Audio Mixer is developed and maintained by Realstrings in support of Samaritans. If Vue-Audio-Mixer makes it to your production environment, we would appreciate you making a donation at the following link. https://www.justgiving.com/fundraising/onlineaudiomixer