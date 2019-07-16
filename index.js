const prompts = require('prompts')
const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')
const chalk = require('chalk')
const ora = require('ora');


const rawTarget = process.argv[2]

if (!rawTarget) {
  console.error('You must specify a target folder')
  return 1
}

const targetFolder = path.resolve(rawTarget)

if (!fs.existsSync(path.resolve(targetFolder, '..'))) {
  console.error('The parent folder does not exist')
  return 1
}


fs.mkdirSync(targetFolder, { recursive: true })

const spawn = (command, arguments, options) =>
  childProcess.spawn(command, arguments, {shell: process.platform == 'win32', ...options})

const run = command => new Promise((resolve, reject) => {
  const splitCommand = command.split(' ')
  const childProcess = spawn(splitCommand[0], splitCommand.slice(1), {cwd: targetFolder})
  childProcess.stderr.pipe(process.stderr)
  childProcess.on('close', code => {
    if (code === 0) {
      resolve()
    } else {
      reject(`process failed with code ${code}`)
    }
  })
})

const install = package => () => new Promise((resolve, reject) => {
  const spinner = ora(`installing ${package}`).start()

  const childProcess = spawn('npm', ['install', package, '--silent'], {cwd: targetFolder})
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

run('npm init -y')
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
  .then(install('@kanshi/kanshi-sha'))
  .then(install('@kanshi/kanshi'))
  .then(() => {
      fs.copyFileSync('setup/launcher.js', path.resolve(targetFolder, 'index.js'))
      fs.mkdirSync(path.resolve(targetFolder, 'configuration'))
      fs.copyFileSync('setup/standalones.js', path.resolve(targetFolder, 'configuration', 'standalones.js'))
      fs.copyFileSync('setup/packages.js', path.resolve(targetFolder, 'configuration', 'packages.js'))
      fs.copyFileSync('setup/providers.js', path.resolve(targetFolder, 'configuration', 'providers.js'))
      fs.mkdirSync(path.resolve(targetFolder, 'providers'))
  })
  .catch(console.error)
