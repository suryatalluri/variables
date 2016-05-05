/*global WM, Application*/

Application.$controller('GooglemapsController', ['$scope', 'Utils', '$element', 'NgMap', '$timeout', '$http', 'wmToaster', 'CONSTANTS',
    function ($s, Utils, $el, NgMap, $timeout, $http, wmToaster, CONSTANTS) {
        'use strict';
        var prefabScope,
            _locations = [],
            _icon = '',
            _lat  = '',
            _lng  = '',
            _info = '',
            _color,
            _radius,
            perimeter,
            latSum      = 0,
            lngSum      = 0,
            latNaNCount = 0,
            lngNaNCount = 0,
            markerIndex = 0,
            infowindow,
            customMarker,
            customMarkers = [],
            defaultCenter = 'current-position',
            _oldBoundLocations = -1,
            _buildMap,
            _updateDirections,
            _refreshMap,
            _deregisterFns = {'directions': _.noop},
            invalidMarker = 0;

        $s.maps = $s.directionsData = [];
        $s.onMapLoad = _refreshMap; //needed whenever the performance is too low on browser.
        $s.$on('mapInitialized', function (event, evtMap) {
            $s.maps.push(evtMap);
            $('div[name=googlemapview]').css('z-index', '15'); //over-rides the prefab default z-index //needed when the search widget is on top of the map, results are overlapped by map
            _refreshMap(); //now call the refresh method to resize map, needed when the map is inside the dialogs or any other hidden element
        });

        function constructLatLngObject(lat, lng) {
            if (google) {
                return new google.maps.LatLng(lat, lng);
            }
        }

        function markLatLng(lat, lng, markerId) { //points the marker based on lat & lng
            if (!$s.maps[0] && (!_lat || !_lng)) {
                return;
            }
            if (isNaN(lat) || isNaN(lng)) {
                return;
            }
            //remove the previous marker only if the markerId is not provided
            clearNoIdMarker();
            var latlngObj = constructLatLngObject(lat, lng);
            customMarker = new google.maps.Marker({
                'position'  : latlngObj,
                'map'       : $s.maps[0],
                'draggable' : true,
                'animation' : google.maps.Animation.DROP
            });
            $s.maps[0].panTo(latlngObj);
            if (markerId) {
                customMarker.$$id = markerId.toString();
            }
            customMarkers.push(customMarker);
        }

        function markAddress(address, markerId) {//points the marker based on address , can also be used when lat&lng is in the same string
            var baseUrl,
                results,
                geometryLocations;
            if (!address) {
                return;
            }
            baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json?address=';
            $http.get(baseUrl + address).then(function (response) {
                results = response.data.results[0];
                if (!results) {
                    return;
                }
                geometryLocations = results.geometry.location;
                markLatLng(geometryLocations.lat, geometryLocations.lng, markerId);
            });
        }

        function _removeMarkers(markerArray) { //removes all the markers if the markerArray is not passed
            if (!markerArray) {
                _.forEach(customMarkers, function (marker) {
                    marker.setMap(null);
                    marker = null;
                });
                customMarkers = [];
            } else {
                _.forEach(customMarkers, function (marker, index) {
                    if (marker) {
                        if (_.includes(markerArray, marker.$$id.toString())) {
                            marker.setMap(null);
                            marker = null;
                            customMarkers.splice(index, 1);
                        }
                    }
                });
            }
        }

        function clearNoIdMarker() {
            _.forEach(customMarkers, function (marker, index) {
                if (marker) {
                    if (!marker.$$id) {
                        marker.setMap(null);
                        marker = null;
                        customMarkers.splice(index, 1);
                    }
                }
            });
        }
        
        $s.clearMarkers = _removeMarkers;

        function removeMarker(markerIds) { //removes the marker placed based on marker Id
            var markerArray = [];
            if (!markerIds) {
                return;
            }
            if (WM.isObject(markerIds) || WM.isArray(markerIds)) {
                markerArray = markerIds;
                _removeMarkers(markerArray);
            } else {
                markerArray.push(markerIds);
                _removeMarkers(markerArray);
            }
        }

        function prepareLatLngData(lat, lng) {
            var latlng;
            if (lat && lng) {
                latlng = '[' + lat + ', ' + lng + ']';
            }
            if (isNaN(lat) || lat === null || lat === '') {
                latNaNCount++;
            } else {
                latSum += Number(lat);
            }
            if (isNaN(lng) || lng === null || lng === '') {
                lngNaNCount++;
            } else {
                lngSum += Number(lng);
            }
            return latlng;
        }

        function setCenter() { //based on the locations binded, sets the center of the map
            var len = $s.markersData.length,
                lat = latSum / (len - latNaNCount),
                lng = lngSum / (len - lngNaNCount);
            $s.center = (len === latNaNCount || len === lngNaNCount) ? '[0,0]' : '[' + lat + ', ' + lng + ']';
            $s.centerData = {
                'lat': lat,
                'lng': lng
            };
            _refreshMap();
        }

        function alterMarkersObject(responseLatLng) {        //alter the already prepared marker object's latlng property
            if ($s.markersData[markerIndex]) {
                $s.markersData[markerIndex].latlng = responseLatLng;
                markerIndex++;
            }
            if (markerIndex >= $s.markersData.length) {
                setCenter();
            }
        }

        function getLatLng(address) {               //this function fetches the lat and lng and constructs the marker Object
            var lat, lng;
            if (!address) {
                invalidMarker++;
                return;
            }
            $http.get('https://maps.googleapis.com/maps/api/geocode/json?address=' + address).then(function (response) {
                var resultdataSet = response.data.results[0];
                if (resultdataSet) {
                    var geometryLocations = resultdataSet.geometry.location,
                        latlng;
                    lat     = geometryLocations.lat;
                    lng     = geometryLocations.lng;
                    latlng  = prepareLatLngData(lat, lng);
                    alterMarkersObject(latlng);
                } else {
                    invalidMarker++;
                }
            });
        }

        $s.showInfoWindow = function (event, p) {  //opens the info-window specific to the marker , fixes the bug 'info-window' directive fails to load the info
            if (!$s.info || !google) {
                return;
            }
            var latlngData = p.latlng.replace(/\[|\]/g, '').split(','),
                center = constructLatLngObject(latlngData[0], latlngData[1]);
            if (infowindow) { //close other info windows if they're open
                infowindow.close();
            }
            infowindow = new google.maps.InfoWindow({
                'content'       : '<div><p>' + p.information + '</p></div>',
                'pixelOffset'   : new google.maps.Size(0, -30)
            });
            infowindow.setPosition(center);
            infowindow.open($s.maps[0]);
        };

        //constructs the marker object
        function constructMarkersModel() {
            var lat, lng, latlng, address = '';
            markerIndex     = latSum = lngSum = latNaNCount = lngNaNCount = 0; //start the marker mapping data again when there is a new call to construct marker
            $s.markersData  = _locations.map(function (marker, index) {
                if ($s.markertype === 'Address') {
                    $s.addressData = $s.address.split(' ');
                    _.forEach($s.addressData, function(addrValue, index) {
                        addrValue = Utils.findValueOf(marker, $s.addressData[index]) + ' ';
                        address += addrValue || '';
                    });
                    getLatLng(address);
                    address = '';
                } else {
                    lat     = Utils.findValueOf(marker, _lat);
                    lng     = Utils.findValueOf(marker, _lng);
                    latlng  = prepareLatLngData(lat, lng);
                }
                return {
                    'latlng'     : latlng,
                    'iconData'   : _icon ? Utils.findValueOf(marker, _icon) : '',
                    'information': _info ? Utils.findValueOf(marker, _info) : '',
                    'id'         : $s.$id + '_' + index,
                    'color'      : _color ? Utils.findValueOf(marker, _color) : '',
                    'radius'     : _radius ? Utils.findValueOf(marker, _radius) : ''
                };
            });
        }

        function buildMap() {
            var address = '',
                paramsExists;
            if (_locations) {
                paramsExists = $s.address ? true : (!(!_lat || !_lng));
                if (!paramsExists) {
                    return;
                }
                if (!$s.address) {
                    constructMarkersModel();
                    setCenter();
                } else {
                    constructMarkersModel();
                }
            } else {
                $s.center = defaultCenter;
            }
        }

        _buildMap = _.debounce(buildMap, 50);

        function onMarkerTypeChange(newVal) {
            var wp = $s.widgetProps;
            if (newVal === 'Address') {
                wp.address.show = true;
                wp.lat.show = wp.lng.show = false;
                $s.$root.$emit('set-markup-attr', $s.$parent.widgetid, {
                    'lat': '',
                    'lng': ''
                });
            } else if (newVal === 'LatLng') {
                wp.address.show = false;
                wp.lat.show = wp.lng.show = true;
                $s.$root.$emit('set-markup-attr', $s.$parent.widgetid, {
                    'address': ''
                });
            }
            $s.markersData = [];
        }

        function onLocationsChange(newVal) {

            var markerObj,
                wp = $s.widgetProps,
                options;

            _locations = [];

            if (WM.isArray(newVal)) {
                _locations = newVal;
            } else {
                if (WM.isObject(newVal)) {
                    if (WM.isArray(newVal.data)) {
                        _locations = newVal.data;
                    } else {
                        _locations = [newVal];
                    }
                }
            }

            if ($s.widgetid) {

                options = [''];

                wp.lat.options      = options;
                wp.lng.options      = options;
                wp.icon.options     = options;
                wp.info.options     = options;
                wp.shade.options    = options;
                wp.radius.options   = options;
                wp.address.options  = options;

                if (_locations.length > 0) {
                    markerObj = _locations[0];

                    Utils.getAllKeysOf(markerObj).forEach(function(key) {
                        options.push(key);
                    });
                }

                if ((_oldBoundLocations !== -1) && (_oldBoundLocations !== $s.bindlocations)) {
                    /*Remove the attributes from the markup*/
                    $s.$root.$emit('set-markup-attr', $s.$parent.widgetid, {
                        'lat'       : '',
                        'lng'       : '',
                        'icon'      : '',
                        'info'      : '',
                        'shade'     : '',
                        'radius'    : '',
                        'perimeter' : '',
                        'address'   : ''
                    });
                    $s.lat        = '';
                    $s.lng        = '';
                    $s.icon       = '';
                    $s.info       = '';
                    $s.shade      = '';
                    $s.radius     = '';
                    $s.perimeter  = '';
                    $s.address    = '';

                    _oldBoundLocations = $s.bindlocations;
                }

                if (_oldBoundLocations === -1) {
                    _oldBoundLocations = $s.bindlocations;
                }
            }

            _buildMap();
        }

        function updateDirections() {
            if ($s.origin && $s.destination) {
                Utils.triggerFn(_deregisterFns.directions);

                //watch for the directions
                _deregisterFns.directions = $s.$watch(':: maps[0].directionsRenderers[0]', function(nv) {
                    //if there are no directions return back. nv is undefined between page navigation in studio mode
                    if (!nv) {
                        return;
                    }
                    if (nv.directions) {
                        var routeDetails;
                        routeDetails = nv.directions.routes[0].legs[0];
                        $s.distance  = routeDetails.distance.text;
                        $s.duration  = routeDetails.duration.text;
                    }
                });
            }
        }

        _updateDirections = _.debounce(updateDirections, 50);

        function prepareWayPoints(wayPointsObj) {
            $s.directionsData.wayPoints = [];
            if ($s.waypoints) {
                var newWayPoints = [],
                    showStopOver;
                if (WM.isArray($s.waypoints)) {
                    showStopOver = true;
                    if (wayPointsObj) {
                        _.forEach(wayPointsObj, function(wayPoint) {
                            wayPoint.stopover = $s.stopover;
                            newWayPoints.push(wayPoint);
                        });
                        $s.directionsData.wayPoints = newWayPoints;
                    }
                } else if (WM.isString($s.waypoints) && CONSTANTS.isStudioMode) {
                    showStopOver = false;
                    wmToaster.warn('Waypoints bound cannot be of string type, Please refer documentation for more details');
                }
                $s.widgetProps.stopover.show = showStopOver;
            }
        }

        /* Define the property change handler. This function will be triggered when there is a change in the prefab property */
        function propertyChangeHandler(key, newVal) {
            switch (key) {
                case 'locations':
                    onLocationsChange(newVal);
                    break;
                case 'markertype':
                    onMarkerTypeChange(newVal);
                    break;
                case 'address':
                    _buildMap();
                    break;
                case 'lat':
                    _lat = newVal;
                    _buildMap();
                    break;
                case 'lng':
                    _lng = newVal;
                    _buildMap();
                    break;
                case 'icon':
                    _icon = newVal;
                    _buildMap();
                    break;
                case 'info':
                    _info = newVal;
                    _buildMap();
                    break;
                case 'shade':
                    _color = newVal;
                    _buildMap();
                    break;
                case 'radius':
                    _radius = newVal;
                    _buildMap();
                    break;
                case 'zoom':
                    if (!isNaN(newVal)) {
                        $s.zoom = newVal;
                    }
                    break;
                case 'origin':
                    $s.directionsData.origin = newVal;
                    _updateDirections();
                    break;
                case 'destination':
                    $s.directionsData.destination = newVal;
                    _updateDirections();
                    break;
                case 'waypoints':
                    prepareWayPoints(newVal);
                    $s.$parent.widgetProps.stopover.show = newVal ? true : false;
                    break;
                case 'perimeter':
                    perimeter = newVal;
                    break;
                case 'trafficlayer':
                    $s.trafficlayer = newVal;
                    break;
            }
        }

        /* register the property change handler */
        $s.propertyManager.add($s.propertyManager.ACTIONS.CHANGE, propertyChangeHandler);

        _refreshMap = _.debounce(refresh, 80);

        function refresh() {
            //check if the maps object is formed and then refresh
            if (!$s.maps[0]) {
                return;
            }
            var mapData = $s.maps[0];
            //re-size the map whenever the map is loaded in any container like dialog, tabs or any hidden elements
            $timeout(function() {
                google.maps.event.trigger(mapData, 'resize');
                //check for the lat, lng values if they're NaN and they exist
                if ($s.centerData && (!(isNaN($s.centerData.lat) || isNaN($s.centerData.lng)))) {
                    mapData.panTo(constructLatLngObject($s.centerData.lat, $s.centerData.lng));
                }
            }, 100);
        }

        $s.refresh                  = _refreshMap;
        prefabScope                 = $el.closest('.app-prefab').isolateScope();
        prefabScope.redraw          = _refreshMap;
        prefabScope.markLatLng      = markLatLng;
        prefabScope.markAddress     = markAddress;
        prefabScope.removeMarker    = removeMarker;
        prefabScope.clearAllMarkers = _removeMarkers;
    }]);