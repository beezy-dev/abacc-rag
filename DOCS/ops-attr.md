# Operation-based attributes

Let's put some content into a file:
```
$ echo "this is my document" > document.txt
$ cat document.txt
this is my document
```

if I push some content in with a single ```>```, this will replace the original content
```
$ echo "this is your document" > document.txt
$ cat document.txt
this is your document
```

if I add an operational ```append-only``` to the file 
```
$ sudo chattr +a document.txt
$ lsattr
-----a---------------- ./document.txt
```

and try the same content replacement it will failed as I can only append new content
``` 
$ cat document.txt
this is your document
$ echo "this is my document" > document.txt
-bash: document.txt: Operation not permitted
```

if I append content, it will then work
```
$ echo "this is my document" >> document.txt
$ cat document.txt
this is your document
this is my document
```

also, no matter my privilege level, I will not be allowed to replace content or even delete the file
```
$ ls -al document.txt
-rw-r--r-- 1 romadams romadams 42 Jun 17 06:31 document.txt
$ rm -rf document.txt
rm: cannot remove 'document.txt': Operation not permitted
$ sudo echo "this is my document" > document.txt
-bash: document.txt: Operation not permitted
$ sudo rm -rf document.txt
[sudo] password for romadams:
rm: cannot remove 'document.txt': Operation not permitted
```

then I remove the attribute and I will be able to replace content and delete the file
```
$ sudo chattr -a document.txt
$ lsattr document.txt
---------------------- document.txt
$ rm -rf document.txt
```