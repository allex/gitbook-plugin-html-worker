/**
 * HTML worker plugin for customize parse gitbook distributes.
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('util')
const readdir = util.promisify(fs.readdir)
const writeFile = util.promisify(fs.writeFile)

const htmlMinifier = require('html-minifier').minify
const readFileSync = f => fs.readFileSync(f, 'utf8')

const pluginName = 'html-worker'

class Worker {
  constructor (book, cfg) {
    this.rt = book
    this.cfg = cfg
    this.root = book.resolve('')
    this.output = book.output.root()

    this.logger = ['debug', 'info', 'warn', 'error'].reduce((o, m) => {
      o[m] = (...args) => { book.log[m].ln('html-worker', ...args) }
      return o
    }, {})

    if (cfg && cfg.outro) {
      const outroFile = path.resolve(this.root, cfg.outro)
      if (fs.existsSync(outroFile)) {
        this._outroContent = readFileSync(outroFile).trim()
      } else {
        this.logger.warn('outro file not exists "' + outroFile + '"')
      }
    }
  }

  processHtml (html, filename) {
    const cfg = this.cfg
    const relPath = path.relative(this.output, filename)

    // add global outro
    if (cfg.outro && this._outroContent) {
      html = html
        .replace('</body>', os.EOL + this._outroContent + os.EOL + '</body>')
      this.logger.debug('parse outro "' + relPath + '"')
    }

    // minify html
    const minifyOption = Object.assign({
      removeComments: true,
      removeCommentsFromCDATA: true,
      collapseBooleanAttributes: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      minifyJS: true,
      maxLineLength: 1024
    }, this.cfg['html-minifier'])

    html = htmlMinifier(html, minifyOption)
    this.logger.debug('minifier "' + relPath + '"')

    return html
  }

  minifyHtml () {
    const walkDir = dirPath =>
      readdir(dirPath).then(files =>
        Promise.all(
          files.map(f => {
            f = path.join(dirPath, f)
            const stat = fs.statSync(f)
            if (stat.isFile() && f.match(/\.html$/) !== null) {
              const html = fs.readFileSync(f, 'utf8').replace(/^\s+|\s+$/mg, '')
              return writeFile(f, this.processHtml(html, f))
                .then(result => {
                  this.logger.info('process => "' + path.relative(this.output, f) + '"')
                  return f
                })
            } else if (stat.isDirectory()) {
              return walkDir(f)
            }
          })
        )
      ).catch(err => Promise.reject(err))
    return walkDir(this.output, this.rt)
  }

  build () {
    return this.minifyHtml()
  }
}

module.exports = {
  hooks: {
    'finish': function (page) {
      const cfg = this.config.get('pluginsConfig')[pluginName]
      const worker = new Worker(this, cfg)
      try {
        return worker.build()
      } catch (e) {
        console.log(e.stack)
      }
    }
  }
}
