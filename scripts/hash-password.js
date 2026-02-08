#!/usr/bin/env node
const bcrypt = require('bcryptjs');
const password = process.argv[2] || 'Caleb$771';
console.log(bcrypt.hashSync(password, 10));
