Application.run(function ($rootScope) {
    "use strict";
    /* perform any action with the variables inside this block(on-page-load) */
    $rootScope.onAppVariablesReady = function () {
        /*
         * variables can be accessed through '$rootScope.Variables' property here
         * e.g. $rootScope.Variables.staticVariable1.getData()
         */
    };

    /* perform any action on session timeout here, e.g clearing some data, etc */
    $rootScope.onSessionTimeout = function () {
        /*
         * NOTE:
         * On re-login after session timeout:
         * if the same user logs in(through login dialog), app will retain its state
         * if a different user logs in, app will be reloaded and user is redirected to respective landing page configured in Security.
         */
    };
});