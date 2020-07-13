const server = require('@kanshi/kanshi/server/index')

server({
    configuration: 'configuration',
    providers: 'providers',
    resources: 'public'
})
