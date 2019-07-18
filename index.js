#!/usr/bin/env node

const fs = require('fs')
const https = require('https')
const path = require('path')
const childProcess = require('child_process')
const chalk = require('chalk')
const ora = require('ora');

const fetch = url => (new Promise((resolve, reject) => {
  https.get(url, response => {
    if (response.statusCode === 302) {
      return resolve(fetch(`https://${response.req._headers.host}${response.headers.location}`))
    }
    let data = ''

    response.on('data', chunk => data += chunk)
    response.on('end', () => resolve(JSON.parse(data)))
  }).on('error', error => reject(`Error: ${err.message}`))
}))

const spawn = (command, arguments, options) =>
  childProcess.spawn(command, arguments, {shell: process.platform == 'win32', ...options})

const run = (command, directory) => new Promise((resolve, reject) => {
  const splitCommand = command.split(' ')
  const childProcess = spawn(splitCommand[0], splitCommand.slice(1), {cwd: directory || path.resolve('.')})
  childProcess.stderr.pipe(process.stderr)
  childProcess.on('close', code => {
    if (code === 0) {
      resolve()
    } else {
      reject(`process failed with code ${code}`)
    }
  })
})

const install = (package, directory) => () => new Promise((resolve, reject) => {
  const spinner = ora(`installing ${package}`).start()

  const childProcess = spawn('npm', ['install', package, '--silent'], {cwd: directory || path.resolve('.')})
  childProcess.stderr.pipe(process.stderr)
  childProcess.on('close', code => {
    if (code === 0) {
      spinner.succeed(`installed ${package}`)
      resolve()
    } else {
      spinner.fail(`installation of ${package} failed with code ${code}`)
      reject()
    }
  })
})


const argument = process.argv[2]

if (!argument) {
  console.error('You must specify a target folder')
  return 1
}

if (argument !== 'install' || !fs.existsSync(path.resolve('.', 'package.json')) && !process.argv[3]) {
  const targetFolder = path.resolve(argument)

  if (!fs.existsSync(path.resolve(targetFolder, '..'))) {
    console.error('The parent folder does not exist')
    return 1
  }


  fs.mkdirSync(targetFolder, { recursive: true })

  run('npm init -y', targetFolder)
    .then(() => {
      const package = JSON.parse(fs.readFileSync(path.resolve(targetFolder, 'package.json'), 'utf-8'))
      package.private = true
      package.scripts = { start: 'node index.js' }
      delete package.description
      delete package.keywords
      delete package.author
      delete package.license
      fs.writeFileSync(path.resolve(targetFolder, 'package.json'), JSON.stringify(package, null, 2))
    })
    .then(() => {
      fs.writeFileSync(path.resolve(targetFolder, '.gitignore'), 'node_modules')
    })
    .then(install('@kanshi/kanshi-sha', targetFolder))
    .then(install('@kanshi/kanshi', targetFolder))
    .then(() => {
      fs.copyFileSync('setup/launcher.js', path.resolve(targetFolder, 'index.js'))
      fs.mkdirSync(path.resolve(targetFolder, 'configuration'))
      fs.copyFileSync('setup/standalones.js', path.resolve(targetFolder, 'configuration', 'standalones.js'))
      fs.copyFileSync('setup/packages.js', path.resolve(targetFolder, 'configuration', 'packages.js'))
      fs.copyFileSync('setup/providers.js', path.resolve(targetFolder, 'configuration', 'providers.js'))
      fs.mkdirSync(path.resolve(targetFolder, 'providers'))
    })
    .catch(console.error)
} else if (argument === 'install') {
  if (!process.argv[3]) {
    console.error("You didn't specify what provider you wanted to install")
    return 1
  }

  if (!fs.existsSync(path.resolve('.', 'package.json'))) {
    console.error('Missing package.json file. Are you sure you are in the right folder?')
    return 1
  }

  const provider = process.argv[3]

  fetch(`https://unpkg.com/${provider}/kanshi.json`)
    .then(install(provider))
    .then(() => {
      const spinner = ora(`setting up ${provider}`).start()

      const manifest = JSON.parse(fs.readFileSync(path.resolve('node_modules', provider, 'kanshi.json'), 'utf-8'))
      fs.writeFileSync(path.resolve('providers', `${manifest.name}.js`), `module.exports = require('${provider}')`)

      const configuration = (manifest.name + ': ' + JSON.stringify({
        provider: manifest.name,
        configuration: manifest.configuration.provider
      }, null, 2) + ',')
          .split("\n")
          .map(line => '  ' + line)
          .join("\n")

      let providers = fs.readFileSync(path.resolve('configuration', 'providers.js'), 'utf-8').split("\n")
      providers.splice(1, 0, configuration)
      fs.writeFileSync(path.resolve('configuration', 'providers.js'), providers.join("\n"))

      const providersConfigurationPath = path.relative('.', path.resolve('configuration', 'providers.js'))
      const standalonesConfigurationPath = path.relative('.', path.resolve('configuration', 'standalones.js'))
      const packagesConfigurationPath = path.relative('.', path.resolve('configuration', 'packages.js'))

      spinner.succeed(`${chalk.bold(manifest.name)} has been installed successfully`)
      console.log(`  A temporary configuration skeleton has been set up in ${providersConfigurationPath}`)
      console.log(`  The provider configuration (${providersConfigurationPath}) must specify:`)
      for (const key in manifest.configuration.provider) {
        console.log(`    ${chalk.bold(key)}: ${manifest.configuration.provider[key]}`)
      }
      console.log(`  The applications configurations (${standalonesConfigurationPath} and ${packagesConfigurationPath}) must specify:`)
      for (const key in manifest.configuration.application) {
        console.log(`    ${chalk.bold(key)}: ${manifest.configuration.application[key]}`)
      }
      console.log(`  This provider can be used for:`)
      manifest.categories.map(category => console.log(`    ${chalk.bold(category)}`))
    })
    .catch(console.error)
}
