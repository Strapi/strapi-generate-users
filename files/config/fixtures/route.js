'use strict';

/**
 * Module dependencies
 */

// Public node modules
const async = require('async');

// Local utilities.
const regex = require('../../node_modules/strapi/util/regex');

/**
 * Creates Routes
 */

exports.create = function () {
  let deferred = Promise.defer();
  let promises = [];
  let newRoutes = [];
  let routesFound;

  async.auto({
    findRoutes: function (callback) {
      // Find all routes.
      strapi.orm
        .collections
        .route
        .find()
        .exec(function (err, routesFound) {
          if (err) {
            callback(err);
          } else {
            callback(null, routesFound);
          }
        })
    },
    deleteRoutes: ['findRoutes', function (callback, results) {
      // Async dependencies.
      routesFound = results.findRoutes;

      // Delete destroyed routes.
      _.forEach(routesFound, function (routeFound) {
        if (!strapi.config.routes[routeFound.name]) {
          promises.push(strapi.orm.collections.route.destroy({id: routeFound.id}));
        }
      });

      callback(null);
    }],
    updateOrCreateRoutes: ['findRoutes', function (callback, results) {
      // Async dependencies.
      routesFound = results.findRoutes;

      // Find or create routes.
      _.forEach(strapi.config.routes, function (route, key) {
        if (_.find(routesFound, {name: key})) {
          promises.push(strapi.orm.collections.route.update({
            name: key
          }, {
            name: key,
            policies: route.policies,
            controller: route.controller,
            action: route.action
          }));
        } else {
          newRoutes.push(key);
          promises.push(strapi.orm.collections.route.create({
            name: key,
            policies: route.policies,
            controller: route.controller,
            action: route.action
          }));
        }
      });

      callback(null);
    }],
    execRoutesModifications: ['deleteRoutes', 'updateOrCreateRoutes', function (callback) {
      // Exec the promises.
      Promise.all(promises)
        .then(function (responses) {
          callback(null, responses);
        })
        .catch(function (err) {
          callback(err);
        });
    }],
    findNewRoutes: ['execRoutesModifications', function (callback) {
      // Find created routes.
      strapi.orm
        .collections
        .route
        .find({
          'name': newRoutes
        })
        .populate('roles')
        .exec(function (err, newRoutesFound) {
          if (err) {
            callback(err);
          } else {
            callback(null, newRoutesFound);
          }
        });
    }],
    updateCreatedRoutes: ['execRoutesModifications', 'findNewRoutes', 'findRoles', function (callback, results) {
      // Async dependencies.
      let newRoutesFound = results.findNewRoutes;
      let roles = results.findRoles;

      const contributorVerbs = ['put', 'patch', 'delete'];
      const userContributorRoutes = [
        'GET /user/:id',
        'PUT /user/:id',
        'DELETE /user/:id'
      ];
      const userRegisteredRoutes = [
        'PUT /user/:id',
        'DELETE /user/:id'
      ];
      let verb;
      let contributorRole = _.find(roles, {name: 'contributor'});
      let registeredRole = _.find(roles, {name: 'registered'});
      let adminRole = _.find(roles, {name: 'admin'});

      _.forEach(newRoutesFound, function (newRoute) {
        if (!_.contains(newRoute.name, '/dashboard')) {

          // Contributor permissions.
          verb = regex.detectRoute(newRoute.name).verb;
          newRoute.isPublic = false;
          newRoute.registeredAuthorized = false;
          newRoute.contributorsAuthorized = false;

          if (_.contains(newRoute.name, '/auth')) {
            newRoute.isPublic = true;
          } else if (_.contains(newRoute.name, '/user')) {
            if (_.contains(userContributorRoutes, newRoute.name)) {
              newRoute.contributorsAuthorized = true;
            }
            if (_.contains(userRegisteredRoutes, newRoute.name)) {
              newRoute.registeredAuthorized = true;
            }
          } else {
            if (verb === 'get') {
              newRoute.isPublic = true;
              newRoute.registeredAuthorized = true;
            }
            newRoute.contributorsAuthorized = true;
          }

          newRoute.roles.add(adminRole.id);

          promises.push(new Promise(function (resolve, reject) {
            newRoute.save(function (err) {
              if (err) {
                reject(err);
              }
            });

            resolve();
          }));
        }
      });

      Promise.all(promises)
        .then(function (newRoutes) {
          callback(null, newRoutes);
        })
        .catch(function (err) {
          callback(err);
        });

    }],
    findRoles: [function (callback) {
      // Find roles.
      strapi.orm
        .collections
        .role
        .find()
        .exec(function (err, roles) {
          if (err) {
            callback(err);
          } else {
            callback(null, roles);
          }
        })
    }]
  }, function cb(err, results) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve(results);
    }
  });

  return deferred.promise;
};
