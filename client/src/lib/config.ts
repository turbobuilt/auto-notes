import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
// import * as variables from '../scss/variables.module.scss';
// import ctrlS from '@/directives/ctrlS';
// const { primary, secondary, tertiary, error } = variables as any;

export function addConfig(app) {
    const vuetify = createVuetify({
        icons: {
            defaultSet: 'mdi',
            aliases,
            sets: {
                mdi,
            },
        },
        // theme: {
        //     themes: {
        //         light: {
        //             colors: {
        //                 primary: primary,
        //                 secondary: secondary,
        //                 tertiary: tertiary,
        //                 error: error,
        //             }
        //         },
        //     },
        // },
    });
    app.use(vuetify);
}