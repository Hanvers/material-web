# VASP 6.5.1 + VTST + VASPml + LAMMPS MLFF 安装报告与使用教程

> 本文记录学校服务器上 VASP + LAMMPS MLFF 的实际安装结果。
>
> **阅读约定**：命令块里带 `# [仅检查]` 的行只用于确认状态，可跳过；不带标注的是必做步骤。

---

## 目录

1. [安装摘要](#1-安装摘要)
2. [总体架构](#2-总体架构)
3. [环境与目录约定](#3-环境与目录约定)
4. [VASP 侧：VTST + 固定基矢 + VASPml](#4-vasp-侧vtst--固定基矢--vaspml)
5. [LAMMPS 侧：ML-VASP 补丁](#5-lammps-侧ml-vasp-补丁)
6. [部署与环境变量](#6-部署与环境变量)
7. [使用教程：ML_FF](#7-使用教程ml_ff)
8. [踩坑总表](#8-踩坑总表)
9. [维护与升级](#9-维护与升级)
10. [附录](#10-附录)

---

## 1. 安装摘要

| 项目       | 内容                                                           |
| ---------- | -------------------------------------------------------------- |
| 安装根目录 | `/public/home/cugb2013010007/soft/vasp6.5.1-lammps`          |
| 编译器     | `compiler/intel/2021.3.0`（`ifort` / `icpc` / `icpx`） |
| MPI        | `mpi/intelmpi/2021.3.0`                                      |
| 数学库     | Intel MKL 2021.3，链接方式 `-mkl=sequential`                 |
| 优化目标   | `-xHOST`（编译节点与计算节点同构）                           |

### 1.1 交付物

| 产物             | 路径                               | 说明                                                                    |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `vasp_std_lmp` | `…/vasp.6.5.1/bin/vasp_std_lmp` | VASP 6.5.1 + **VASPml** + **VTST** + **固定基矢补丁** |
| `lmp_mlff`     | `…/lammps/bin/lmp_mlff`         | LAMMPS（`vasp-mlff` 分支）+ `pair_style vasp`                       |

### 1.2 能力清单

`vasp_std_lmp` 同时具备：

- **机器学习力场**：`ML_MODE = train` 训练、`ML_MODE = run` 纯推理（走 C++ VASPml 库，结果应与 Fortran 路径一致）
- **VTST 过渡态工具**：NEB（`ICHAIN = 0`）、dimer（`ICHAIN = 2`）、dynmat、Lanczos，以及 `IOPT` 系列优化器
- **选择性固定晶胞方向**：运行目录放 `OPTCELL` 文件，`ISIF = 3` 时只放开指定基矢

`lmp_mlff` 可以把 `ML_FF` 当力场跑 MD：`pair_style vasp`。

### 1.3 环境变量（已写入 `~/.bashrc`）

```bash
# >>> VASP-LAMMPS MLFF >>>
export PATH=/public/home/cugb2013010007/soft/vasp6.5.1-lammps/lammps/bin:${PATH}
export PATH=/public/home/cugb2013010007/soft/vasp6.5.1-lammps/vasp.6.5.1/bin:${PATH}
# <<< VASP-LAMMPS MLFF <<<
```

两个目录里的可执行文件名字不同（`vasp_std_lmp` / `lmp_mlff`），不会互相遮蔽。

### 1.4 安装后验证（仅检查）

```bash
# [仅检查] 两个命令都能找到
which vasp_std_lmp lmp_mlff

# [仅检查] VASP 版本号：二进制里有多处 vasp.x.y 字样，必须看全部再判断
strings $(which vasp_std_lmp) | grep -oE 'vasp\.[0-9]+\.[0-9]+(\.[0-9]+)?' | sort | uniq -c | sort -rn

# [仅检查] 最可靠：跑一次（哪怕是空目录）看启动 banner / OUTCAR 首行
vasp_std_lmp 2>&1 | grep -m1 -E '^ *vasp\.[0-9]'

# [仅检查] LAMMPS 是否注册了 vasp 这个 pair style
lmp_mlff -h | grep -i -A1 '\bvasp\b'
```

---

## 2. 总体架构

VASP 与 LAMMPS 是**两个独立可执行文件**，通过一个静态库交接：

```
vasp.6.5.1/
├── src/vaspml/                     ← C++ 机器学习库（VASP 6.5.0+ 自带）
│      └── 编译产出 build/std/vaspml/{lib/libvaspml.a, include/InterfaceLAMMPS.hpp}
│                                    │
└── bin/vasp_std_lmp                 │ 软链接到 lammps/lib/vasp/vaspml
                                     ▼
lammps/                              │
├── lib/vasp/vaspml  ────────────────┘
├── src/ML-VASP/pair_vasp.cpp        ← 把 libvaspml 包装成 LAMMPS 风格
└── bin/lmp_mlff                     ← 链接了 libvaspml.a，新增 pair_style vasp
```

运行期关系：

```
ML_FF（VASP 训练出来的力场文件）
   ├── vasp_std_lmp 读它 → 单点/NEB/dimer（可带 VTST）
   └── lmp_mlff     读它 → 能量/力交给 LAMMPS 做积分、控温、控压
```

**关键点**：LAMMPS 只做推理，不训练。训练必须在 VASP 里完成（`ML_MODE = train`）。

---

## 3. 环境与目录约定

### 3.1 模块加载（顺序：编译器在前，MPI 在后）

```bash
module load compiler/intel/2021.3.0
module load mpi/intelmpi/2021.3.0
```

### 3.2 确认工具链（仅检查）

```bash
# [仅检查] 确认是 ifort 而非 ifx → 决定用 makefile.include.intel
mpiifort -v

# [仅检查] 确认 C++ 包装器存在 → 决定 CXX_ML 与 LAMMPS 的 CC
mpiicpc -v

# [仅检查] 确认 MKL 路径由模块提供
echo $MKLROOT
```

### 3.3 目录

```bash
ROOT=/public/home/cugb2013010007/soft/vasp6.5.1-lammps
cd $ROOT
```

---

## 4. VASP 侧：VTST + 固定基矢 + VASPml

改动集中在六个地方，**全部在 `src/` 里做**（`build/std/` 只是 `src/` 的副本，改了会被覆盖）：

| 序号 | 对象                        | 改动                            |
| ---- | --------------------------- | ------------------------------- |
| ①   | `src/main.F`              | 两处调用（VTST 钩子）           |
| ②   | `src/.objects`            | 在 `chain.o` 前插入 15 个对象 |
| ③   | `src/makefile`            | `LIB` 与 `dependencies`     |
| ④   | `src/` 根目录             | 拷入 `vtstcode6.5.1/*`        |
| ⑤   | `src/constr_cell_relax.F` | 替换为读 `OPTCELL` 的版本     |
| ⑥   | `makefile.include`        | Intel 模板 + VASPml 段          |

### 4.1 VTST 版本选择

**目录名 = VASP 版本号**。VASP 6.5.1 对应 `vtstcode6.5.1/`（VTST 2.08 起提供）。

```bash
git clone https://github.com/henkelmangroup/vtstcode.git /tmp/vtstcode
cd /tmp/vtstcode

# [仅检查] 确认目录存在
ls -d vtstcode6.5.1
```

> ⚠️ 用 `vtstcode6.4.3` 或更早的会链接失败：`undefined reference to 'chain_stress_'`（6.5.1 的 `main.F` 新增了对它的调用）。

### 4.2 修改 `src/main.F`

固定格式源码，**续行符 `&` 必须在第 6 列**，这是最容易改坏的地方。

第一处：

```fortran
! 原样
      CALL CHAIN_FORCE(T_INFO%NIONS,DYN%POSION,TOTEN,TIFOR, &
     &     LATT_CUR%A,LATT_CUR%B,IO%IU6)

! 改为（多传一个 TSIF）
      CALL CHAIN_FORCE(T_INFO%NIONS,DYN%POSION,TOTEN,TIFOR, &
     &     TSIF,LATT_CUR%A,LATT_CUR%B,IO%IU6)
```

第二处（VASP ≥ 6.2 要求无条件调用）：

```fortran
! 原样
      IF (LCHAIN) CALL chain_init( T_INFO, IO)

! 改为
      CALL chain_init( T_INFO, IO)
```

> 💡 改完务必复核一次，第 6 列的 `&` 丢了会报 `#5143 Missing mandatory separating blank`，且报错行看起来像乱码：
> `sed -n "$(grep -n CHAIN_FORCE src/main.F | cut -d: -f1),+1p" src/main.F | cat -A`

### 4.3 修改 `src/.objects`

找到 `SOURCE` 列表里的 `chain.o`，在它**之前**插入：

```makefile
bfgs.o dynmat.o instanton.o lbfgs.o sd.o cg.o dimer.o bbm.o \
fire.o lanczos.o neb.o qm.o \
pyamff_fortran/*.o ml_pyamff.o \
opt.o \
```

顺序规则：

- `dynmat.o` `neb.o` `dimer.o` `lanczos.o` `instanton.o` 必须在 `chain.o` **前**
- `sd.o` `cg.o` `qm.o` `lbfgs.o` `bfgs.o` `fire.o` 和 `ml_pyamff.o`、`pyamff_fortran/*.o` 必须在 `opt.o` **前**

### 4.4 修改 `src/makefile`

```makefile
# 原：LIB= lib parser
LIB= lib parser pyamff_fortran

# 原：dependencies: sources
dependencies: sources libs
```

`LIB` 让 `pyamff_fortran/` 目录参与编译（`IOPT=8` 的 PyAMFF 后端）；`dependencies` 加 `libs` 是为了**并行编译**时先编库、避免 `.mod` 找不到。

### 4.5 拷入 VTST 源码

```bash
cd $ROOT/vasp.6.5.1
mkdir -p vtst-backup
cp src/chain.F src/dynamic.F vtst-backup/ 2>/dev/null
cp -r /tmp/vtstcode/vtstcode6.5.1/* src/
```

`chain.F` 与 `dynamic.F` 是**覆盖**式的，备份不能省（VTST 没有"卸载"）。

### 4.6 固定基矢补丁：替换 `constr_cell_relax.F`

`src/constr_cell_relax.F` 是 VASP 留出的钩子：变胞时 `FCELL` 保存作用在基矢上的力，把不需要的分量清零即可冻结对应方向。用下面的版本**整文件覆盖** `src/constr_cell_relax.F`：

```fortran
!-----------------------------------------------------------------------
!
! At present, VASP does not allow to relax the cellshape selectively
! i.e. for instance only cell relaxation in x direction.
! To be more precisse, this behaviour can not be achived via the INCAR
! or POSCAR file.
! However, it is possible to set selected components of the stress tensor
! to zero.
! The most conveninent position to do this is the routines
! CONSTR_CELL_RELAX  (constraint cell relaxation).
! FCELL contains the forces on the basis vectors.
! These forces are used to modify the basis vectors according
! to the following equations:
!
!      A_OLD(1:3,1:3)=A(1:3,1:3) ! F90 style
!      DO J=1,3
!      DO I=1,3
!      DO K=1,3
!        A(I,J)=A(I,J) + FCELL(I,K)*A_OLD(K,J)*STEP_SIZE
!      ENDDO
!      ENDDO
!      ENDDO
! where A holds the basis vectors (in cartesian coordinates).
!
!-----------------------------------------------------------------------

      SUBROUTINE CONSTR_CELL_RELAX(FCELL)
      USE prec
      REAL(q) FCELL(3,3)

!     just one simple example
!     relaxation in x directions only
!      SAVE=FCELL(1,1)
!      FCELL=0   ! F90 style: set the whole array to zero
!      FCELL(1,1)=SAVE
!     relaxation in z direction only
!      SAVE=FCELL(3,3)
!      FCELL=0   ! F90 style: set the whole array to zero
!      FCELL(3,3)=SAVE

      LOGICAL FILFLG
      INTEGER ICELL(3,3)
      INQUIRE(FILE='OPTCELL',EXIST=FILFLG)
      IF (FILFLG) THEN
         OPEN(67,FILE='OPTCELL',FORM='FORMATTED',STATUS='OLD')
         DO J=1,3
            READ(67,"(3I1)") (ICELL(I,J),I=1,3)
         ENDDO
         CLOSE(67)
         DO J=1,3
         DO I=1,3
            IF (ICELL(I,J)==0) FCELL(I,J)=0.0
         ENDDO
         ENDDO
      ENDIF

      RETURN
      END SUBROUTINE
```

用法：运行目录放一个 `OPTCELL` 文件（3 行 × 3 位 0/1，`0` 为冻结，第 J 行对应第 J 条基矢），配合 `ISIF = 3` 生效；没有该文件时行为与官方 VASP 完全一致。

### 4.7 `makefile.include`（Intel 2021.3 配方）

```bash
cp arch/makefile.include.intel ./makefile.include
```

需要改 4 处：

| 位置       | 原值                                          | 改为                        | 原因                                         |
| ---------- | --------------------------------------------- | --------------------------- | -------------------------------------------- |
| MKL 开关   | `FCL += -qmkl=sequential`                   | `FCL += -mkl=sequential`  | `-qmkl` 是 ifx 的拼法，ifort 只认 `-mkl` |
| 目标指令集 | `VASP_TARGET_CPU ?= -xHOST`                 | 保持 `-xHOST`             | 同构集群已确认；异构则改 `-xCORE-AVX2`     |
| MKL 路径   | `MKLROOT ?= /path/to/your/mkl/installation` | 保持 `?=`                 | 模块会设好 `MKLROOT`                       |
| VASPml 段  | 注释状态                                      | 取消注释并填 `INCLUDE_ML` | 见下                                         |

VASPml 段的最终形态：

```makefile
# For machine learning library vaspml (experimental)
CPP_OPTIONS += -Dlibvaspml
CPP_OPTIONS += -DVASPML_USE_CBLAS
CPP_OPTIONS += -DVASPML_USE_MKL
#CPP_OPTIONS += -DVASPML_DEBUG_LEVEL=3     ← 仅调试用，生产必须注释
CXX_ML      = mpiicpc
CXXFLAGS_ML = -O3 -std=c++17 -Wall
INCLUDE_ML  = -I$(MKLROOT)/include
```

要点：

- `-Dlibvaspml` 是唯一的必要开关，没有它不会编 `src/vaspml`
- `-DVASPML_USE_CBLAS` + `-DVASPML_USE_MKL` 必须成对（MKL 同时提供 CBLAS 与 LAPACKE）
- `CXX_ML` 必须支持 C++17，且**要和 LAMMPS 的 `CC` 同源**（这里都是 Intel 的 `mpiicpc`）
- `INCLUDE_ML` 不能空着：`-mkl` 只加在 Fortran 链接上，C++ 编译找不到 `cblas.h`
- `-DVASPML_DEBUG_LEVEL=3` 会插入高开销运行期检查，官方明确说别用于生产

完整文件见 [附录 A](#附录-a完整-makefileinclude)。

### 4.8 编译

```bash
cd $ROOT/vasp.6.5.1
make clean
make DEPS=1 -j8 std 2>&1 | tee build.log
```

编完部署（改名后保留原名，便于重编对照）：

```bash
cd $ROOT/vasp.6.5.1/bin
ln -sf vasp_std vasp_std_lmp
```

```bash
# [仅检查] 产物是否齐全
ls -l bin/vasp_std
ls -l build/std/vaspml/lib/libvaspml.a
ls -l build/std/vaspml/include/InterfaceLAMMPS.hpp

# [仅检查] VASPml 的 C++ 符号真的链进去了
nm -C bin/vasp_std | grep -m3 'InterfaceLAMMPS'

# [仅检查] VTST 的三个入口符号都在
nm bin/vasp_std | grep -E 'chain_(force|stress|init)_'
```

### 4.9 编译期报错对照

| 报错                                                                              | 原因                                             | 处理                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `main.F(39xx): error #5143 Missing mandatory separating blank`，报错行像乱码    | 手改固定格式源码，第 6 列 `&` 丢失或整行被覆盖 | 从原始 tarball 取回 `src/main.F` 重做                                |
| `warning #10006: ignoring unknown option '-qmkl=sequential'`                    | ifort 不认 oneAPI 拼法                           | 改 `-mkl=sequential`                                                 |
| `libmkl_scalapack_lp64.so: undefined reference to 'slabad_'/'cswap_'/'dlahqr_'` | BLAS/LAPACK 没链上（`-qmkl` 被忽略的直接后果） | 改 `-mkl`；或显式写 `-lmkl_intel_lp64 -lmkl_sequential -lmkl_core` |
| `undefined reference to 'chain_stress_'`                                        | VTST 目录版本不对                                | 换 `vtstcode6.5.1`                                                   |
| `cblas.h: No such file`                                                         | `INCLUDE_ML` 没指到 MKL 头文件                 | `-I$(MKLROOT)/include`                                               |
| `unclassifiable statement`，但代码看起来正常                                    | 粘贴带入零宽字符（U+200B）                       | `sed -i 's/\xe2\x80\x8b//g' src/constr_cell_relax.F`                 |

---

## 5. LAMMPS 侧：ML-VASP 补丁

### 5.1 取源码（固定分支）

```bash
cd $ROOT
git clone https://github.com/vasp-dev/lammps.git
cd lammps
git checkout vasp-mlff
```

```bash
# [仅检查] 基线为 LAMMPS "19 Nov 2024"，且补丁文件存在
git log -1 --oneline
ls src/ML-VASP          # Install.sh  pair_vasp.cpp  pair_vasp.h
```

> 6.5.x 必须用 `vasp-mlff`（传统 make）；CMake 路线（`vasp-mlff-6.6.0`）是 VASP 6.6.0 之后的事。

### 5.2 链接 VASPml —— **必须用绝对路径**

```bash
ln -s /public/home/cugb2013010007/soft/vasp6.5.1-lammps/vasp.6.5.1/build/std/vaspml lib/vasp/vaspml
```

```bash
# [仅检查] 链接有效、两个关键文件都在
readlink -f lib/vasp/vaspml
ls lib/vasp/vaspml/include/InterfaceLAMMPS.hpp
ls lib/vasp/vaspml/lib/libvaspml.a
```

> ⚠️ `lib/vasp/Makefile.lammps` 里写死了相对路径 `-I../../lib/vasp/vaspml/include/`，而编译发生在 `src/Obj_mpi/`，所以链接目标**必须**是 `lib/vasp/vaspml` 这个层级。
> 用相对路径 `../vasp.6.5.1/...` 会解析成 `lammps/lib/vasp.6.5.1/...`（不存在），症状是 `cannot open source file "InterfaceLAMMPS.hpp"`。

### 5.3 安装 ML-VASP 包

```bash
cd $ROOT/lammps/src
make yes-ml-vasp
```

```bash
# [仅检查] 包文件已复制、include 已插入
ls pair_vasp.cpp pair_vasp.h
grep -n 'lib/vasp' Makefile.package.settings
```

`Install.sh` 做了三件事：复制 `pair_vasp.*` 到 `src/`、把 `vasp_SYSINC/SYSLIB` 追加进 `Makefile.package`、把 `include ../../lib/vasp/Makefile.lammps` 插入 `Makefile.package.settings`。

### 5.4 修改 `src/MAKE/Makefile.mpi`

只改 5 行：

```makefile
# 原样
CC =		mpicxx
CCFLAGS =	-g -O3 # -std=c++17
LINK =		mpicxx
LINKFLAGS =	-g -O3 # -std=c++17
LIB =

# 改为（与 VASP 侧的 CXX_ML 对齐）
CC =		mpiicpc
CCFLAGS =	-O3 -std=c++17 -xHOST
LINK =		mpiicpc
LINKFLAGS =	-O3 -std=c++17 -xHOST
LIB =		-mkl=sequential
```

三个必须改的理由：

1. `CC`/`LINK` 必须与 `CXX_ML` 同源，否则 `libvaspml.a` 的 C++ ABI 可能对不上
2. `-std=c++17` 被注释掉了，而 `pair_vasp.cpp` 引用的 `InterfaceLAMMPS.hpp` 需要 C++17
3. `LIB` 为空 → 缺 BLAS/LAPACK → `undefined reference to cblas_dgemm`

**不要**手动加 `-lvaspml` 或 `-I../../lib/vasp/vaspml/include`，`Makefile.package.settings` 会自动带上。

### 5.5 编译

```bash
cd $ROOT/lammps/src
make clean
make mpi -j8 2>&1 | tee build.log
```

```bash
# [仅检查] pair style 已注册
./lmp_mpi -h | grep -i -A1 '\bvasp\b'

# [仅检查] VASPml 符号已静态链接进去
nm -C lmp_mpi | grep -c 'vaspml::'
```

部署：

```bash
mkdir -p $ROOT/lammps/bin
cp $ROOT/lammps/src/lmp_mpi $ROOT/lammps/bin/lmp_mlff
```

### 5.6 编译期报错对照

| 报错                                                      | 原因                                                         | 处理                                            |
| --------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `cannot open source file "InterfaceLAMMPS.hpp"`         | 软链接不存在 / 层级错 / 用了相对路径                         | 用绝对路径重建到 `lib/vasp/vaspml`            |
| `undefined reference to 'vaspml::InterfaceLAMMPS::...'` | `Makefile.package.settings` 没 include `Makefile.lammps` | `make no-ml-vasp && make yes-ml-vasp`         |
| `undefined reference to 'cblas_dgemm'`                  | `LIB` 里没有 MKL                                           | `LIB = -mkl=sequential`                       |
| `'string_view' in namespace 'std' does not name a type` | 没开 C++17                                                   | `CCFLAGS` / `LINKFLAGS` 都加 `-std=c++17` |
| `unrecognized command line option '-xHOST'`             | 误用了 GCC                                                   | 换 `mpiicpc` 或去掉该 flag                    |

---

## 6. 部署与环境变量

```bash
ROOT=/public/home/cugb2013010007/soft/vasp6.5.1-lammps

mkdir -p $ROOT/vasp.6.5.1/bin $ROOT/lammps/bin
ln -sf $ROOT/vasp.6.5.1/bin/vasp_std $ROOT/vasp.6.5.1/bin/vasp_std_lmp
cp    $ROOT/lammps/src/lmp_mpi      $ROOT/lammps/bin/lmp_mlff
```

```bash
# [仅检查] 1.3 节的两行 PATH 是否已写入
grep -n 'VASP-LAMMPS' ~/.bashrc
```

多版本共存（本机已有其它 VASP）的要点：

- 二进制用**带版本/用途的后缀**（`vasp_std_lmp`、`vasp_std_544`），名字天然唯一，可同时进 PATH
- 建软链接而不是 `mv`：重编会重新生成 `bin/vasp_std`，软链接自动跟随
- POTCAR 库（`VASP_PP_PATH`）各版本共用一份，不需要复制

---

## 7. 使用教程：ML_FF

### 7.1 训练 `ML_FF`（VASP）

```ini
SYSTEM   = train
ML_LMLFF = .TRUE.
ML_MODE  = train
NSW      = 2000
IBRION   = 0          ! 训练靠 MD 采样
TEBEG    = 300
TEEND    = 300
```

跑完得到 `ML_AB`（训练集）与 `ML_FF`（力场）。**`ML_FF` 是整个流程的核心产物**，VASP 与 LAMMPS 都用它。

> 6.4.3 及更早版本训出的 `ML_FF` 在 6.5.1 里可直接读；只有 6.5.0 有"读不了自己力场"的版本 bug。

### 7.2 最小闭环验证（必做）

同一帧构型，VASP 算单点：

```ini
ML_LMLFF = .TRUE.
ML_MODE  = run
NSW      = 0
IBRION   = -1
```

LAMMPS 算同一点：

```lammps
units        metal
atom_style   atomic
read_data    system.data
pair_style   vasp
pair_coeff   * * ML_FF Si O
thermo_style custom step pe
run          0
```

两者 `pe` 应一致到 1e-4 eV 量级。对不上先查类型映射。

`POSCAR → system.data`：

```python
from ase.io import read, write
write('system.data', read('POSCAR'), format='lammps-data')
```

### 7.3 LAMMPS MD 输入模板

```lammps
units           metal            # 必须！否则报 VASP potentials require 'metal' units
atom_style      atomic
boundary        p p p
read_data       system.data      # 需要原子 ID 与质量

pair_style      vasp
pair_coeff      * * ML_FF Si O   # 元素顺序按体系改

neighbor        2.0 bin
neigh_modify    every 1 delay 0 check yes

timestep        0.001
thermo          100
thermo_style    custom step temp pe etotal press vol
dump            d1 all custom 1000 traj.lammpstrj id type x y z
dump_modify     d1 sort id

fix             1 all nvt temp 300 300 0.1
run             100000
```

```bash
mpirun -np 32 lmp_mlff -in in.mlff 2>&1 | tee run.log
```

启动日志里要确认两行：`VASP ML force field cutoff = … Angstrom` 和 LAMMPS↔VASP 的类型映射表。

**五个硬约束**（违反会直接报错）：

| 约束                        | 报错                                        |
| --------------------------- | ------------------------------------------- |
| `units metal`             | `VASP potentials require 'metal' units`   |
| 原子有 ID                   | `Pair style vasp requires atom IDs`       |
| `newton on`               | `Pair style vasp requires newton pair on` |
| `pair_coeff` 只能 `* *` | `All pair coeffs are not set`             |
| 类型映射正确                | **不报错，只出错结果**                |

---

## 8. 踩坑总表

按"症状 → 原因 → 修法"整理，都是本次安装真踩过的：

| #  | 症状                                                                     | 原因                                                             | 修法                                               |
| -- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------- |
| 1  | `main.F(39xx)` 报 #5143/#5276，报错行像 `TEIN=0TT_CUR...`            | 手改固定格式源码，第 6 列 `&` 丢失或行被覆盖（手滑多大了字符） | 从 tarball 恢复 `src/main.F`，用 perl/编辑器重做 |
| 2  | `warning #10006: ignoring unknown option '-qmkl=sequential'`           | ifort 用 `-mkl`，`-qmkl` 是 ifx 拼法                         | 改 `-mkl=sequential`                             |
| 3  | `libmkl_scalapack_lp64.so: undefined reference to 'slabad_'/'dlahqr_'` | 上一条的直接后果：BLAS/LAPACK 没进链接行                         | 同上；或显式列 MKL 库并保证顺序                    |
| 4  | `undefined reference to 'chain_stress_'`                               | VTST 目录版本比 VASP 旧                                          | 用 `vtstcode6.5.1`                               |
| 5  | `cannot open source file "InterfaceLAMMPS.hpp"`                        | 软链接用了相对路径，解析到 `lammps/lib/vasp.6.5.1/...`         | `ln -s <绝对路径> lib/vasp/vaspml`               |
| 6  | `cblas.h: No such file`（编 vaspml 时）                                | `INCLUDE_ML` 为空                                              | `-I$(MKLROOT)/include`                           |
| 7  | `'string_view' … does not name a type`                                | LAMMPS 的 `-std=c++17` 被注释                                  | `CCFLAGS`/`LINKFLAGS` 都加                     |
| 8  | 链接期一堆 `ml_pyamff_*` 未定义                                        | 只拷了 `*.F` 没拷 `pyamff_fortran/`                          | 整个目录一起拷，并改 `src/makefile` 的 `LIB`   |
| 9  | 并行编译报 `.mod` 缺失                                                 | `dependencies` 没加 `libs`                                   | `dependencies: sources libs`                     |
| 10 | `unclassifiable statement` 但代码肉眼正常                              | 粘贴带入零宽字符                                                 | `sed -i 's/\xe2\x80\x8b//g'`                     |
| 11 | `illegal instruction` / signal 4                                       | `-xHOST` 编的二进制跑到指令集更低的节点                        | 改 `-xCORE-AVX2` 重编，或确认节点同构            |

---

## 9. 维护与升级

### 9.1 版本绑定关系

| 组件               | 绑定到             | 说明                                     |
| ------------------ | ------------------ | ---------------------------------------- |
| `vtstcode6.5.1`  | VASP 6.5.1         | VASP 小版本变了就得换目录                |
| `vasp-mlff` 分支 | LAMMPS 19 Nov 2024 | 6.6.0 之后改用 CMake + 对应分支          |
| `libvaspml.a`    | LAMMPS 二进制      | 重编 VASP 后 **LAMMPS 必须重链接** |

### 9.2 重编顺序

```bash
# 1) VASP（任何 makefile.include / src 改动后）
cd $ROOT/vasp.6.5.1 && make clean && make DEPS=1 -j8 std
ln -sf vasp_std bin/vasp_std_lmp

# 2) LAMMPS（因为 libvaspml.a 变了）
cd $ROOT/lammps/src && make clean && make mpi -j8
cp lmp_mpi ../bin/lmp_mlff
```

### 9.3 备份清单

| 文件                                                                                       | 建议                                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `vasp.6.5.1/makefile.include`                                                            | `cp makefile.include makefile.include.intel2021.3.ok` |
| `vasp.6.5.1/src/.objects`、`src/makefile`、`src/main.F`、`src/constr_cell_relax.F` | 与原始 tarball 做 `diff` 存档                         |
| `lammps/src/MAKE/Makefile.mpi`                                                           | 同上                                                    |
| `ML_FF`（力场产物）                                                                      | 按体系/训练集分别归档，`ML_AB` 一并保留               |

### 9.4 已知限制

- VASPml 与 LAMMPS 接口在 6.5.x 属 **experimental**，生产前须与 VASP 自身 MD 结果对照
- LAMMPS 侧只做推理，不能继续训练
- `ML_LOGFILE` 等机器学习输出不会产生；需要 spilling factor 监控时在 VASP 里设 `ML_LIB = .FALSE.` 走 Fortran 路径
- 不支持热力学积分（`ML_LCOUPLE`）与热流（`ML_LHEAT`）
- `OPTCELL` 补丁对**非正交晶胞**语义不清晰，请只用于正交/近正交体系

---

## 10. 附录

### 附录 A：完整 `makefile.include`

基于 `arch/makefile.include.intel`，改动处已标注：

```makefile
# Default precompiler options
CPP_OPTIONS = -DHOST=\"LinuxIFC\" \
              -DMPI -DMPI_BLOCK=8000 -Duse_collective \
              -DscaLAPACK \
              -DCACHE_SIZE=4000 \
              -Davoidalloc \
              -Dvasp6 \
              -Dtbdyn \
              -Dfock_dblbuf

CPP         = fpp -f_com=no -free -w0  $*$(FUFFIX) $*$(SUFFIX) $(CPP_OPTIONS)

FC          = mpiifort
FCL         = mpiifort

FREE        = -free -names lowercase

FFLAGS      = -assume byterecl -w

OFLAG       = -O2
OFLAG_IN    = $(OFLAG)
DEBUG       = -O0

# For what used to be vasp.5.lib
CPP_LIB     = $(CPP)
FC_LIB      = $(FC)
CC_LIB      = icc
CFLAGS_LIB  = -O
FFLAGS_LIB  = -O1
FREE_LIB    = $(FREE)

OBJECTS_LIB = linpack_double.o

# For the parser library
CXX_PARS    = icpc
LLIBS       = -lstdc++

##
## Customize as of this point!
##

# 编译节点与运行节点同构，故保持 -xHOST；异构请改 -xCORE-AVX2
VASP_TARGET_CPU ?= -xHOST
FFLAGS     += $(VASP_TARGET_CPU)

# Intel MKL (FFTW, BLAS, LAPACK, and scaLAPACK)
# 注意：ifort 用 -mkl；-qmkl 是 ifx 的写法
FCL        += -mkl=sequential
MKLROOT    ?= /path/to/your/mkl/installation     # 实际由 module 提供
LLIBS      += -L$(MKLROOT)/lib/intel64 -lmkl_scalapack_lp64 -lmkl_blacs_intelmpi_lp64
INCS        =-I$(MKLROOT)/include/fftw

# HDF5-support (optional but strongly recommended)
#CPP_OPTIONS+= -DVASP_HDF5
#HDF5_ROOT  ?= /path/to/your/hdf5/installation
#LLIBS      += -L$(HDF5_ROOT)/lib -lhdf5_fortran
#INCS       += -I$(HDF5_ROOT)/include

# For the VASP-2-Wannier90 interface (optional)
#CPP_OPTIONS    += -DVASP2WANNIER90
#WANNIER90_ROOT ?= /path/to/your/wannier90/installation
#LLIBS          += -L$(WANNIER90_ROOT)/lib -lwannier

# For machine learning library vaspml (experimental)
CPP_OPTIONS += -Dlibvaspml
CPP_OPTIONS += -DVASPML_USE_CBLAS
CPP_OPTIONS += -DVASPML_USE_MKL
#CPP_OPTIONS += -DVASPML_DEBUG_LEVEL=3        # 仅调试
CXX_ML      = mpiicpc
CXXFLAGS_ML = -O3 -std=c++17 -Wall
INCLUDE_ML  = -I$(MKLROOT)/include
```

### 附录 B：`constr_cell_relax.F`

见 [4.6](#46-固定基矢补丁替换-constr_cell_relaxf)，直接整文件覆盖 `src/constr_cell_relax.F`。

### 附录 C：`Makefile.mpi` 差异

```diff
-CC =		mpicxx
-CCFLAGS =	-g -O3 # -std=c++17
-LINK =		mpicxx
-LINKFLAGS =	-g -O3 # -std=c++17
-LIB =
+CC =		mpiicpc
+CCFLAGS =	-O3 -std=c++17 -xHOST
+LINK =		mpiicpc
+LINKFLAGS =	-O3 -std=c++17 -xHOST
+LIB =		-mkl=sequential
```

其余 130 行保持原样。

### 附录 D：从零到跑通的一页命令

```bash
ROOT=/public/home/cugb2013010007/soft/vasp6.5.1-lammps
module load compiler/intel/2021.3.0 mpi/intelmpi/2021.3.0

# ---------- VASP ----------
cd $ROOT/vasp.6.5.1
cp -r /tmp/vtstcode/vtstcode6.5.1/* src/            # 先按 4.1 下载并确认目录
#   → 改 src/main.F（两处）、src/.objects、src/makefile
#   → 覆盖 src/constr_cell_relax.F
cp arch/makefile.include.intel ./makefile.include
#   → -qmkl 改 -mkl；取消 VASPml 段注释；INCLUDE_ML 指 MKL
make clean && make DEPS=1 -j8 std
cd bin && ln -sf vasp_std vasp_std_lmp

# ---------- LAMMPS ----------
cd $ROOT
git clone https://github.com/vasp-dev/lammps.git && cd lammps
git checkout vasp-mlff
ln -s $ROOT/vasp.6.5.1/build/std/vaspml lib/vasp/vaspml
cd src && make yes-ml-vasp
#   → 改 MAKE/Makefile.mpi 的 5 行
make mpi -j8
mkdir -p ../bin && cp lmp_mpi ../bin/lmp_mlff

# ---------- 验收（仅检查） ----------
lmp_mlff -h | grep -i -A1 '\bvasp\b'
nm -C lmp_mlff | grep -c 'vaspml::'
```

---

> **文档维护**：本报告对应 2026-10-20 的安装状态（VASP 6.5.1 / VTST 2.08 的 `vtstcode6.5.1` / LAMMPS `vasp-mlff` @ 19 Nov 2024 / Intel 2021.3）。
> 若后续升级任一组件，请同步更新第 1 章的摘要表与第 9 章的绑定关系。
